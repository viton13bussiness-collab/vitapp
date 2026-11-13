// A WebRTC mesh for VITON13 worlds: everyone connects to everyone, media and messages go straight between devices.
// The site (through a local bridge at `base`) only introduces the devices: presence in a room and a small inbox for
// the first offer and answer. After that the peers renegotiate, chat and keep shared clocks over their own data channel.
//
//   const mesh = createMesh({ api, base: '/api/cinema/screenings/ABC123', me, local, ice, onPeer, onTrack, onMessage, onGone, onEnd })
//   mesh.start(joinedMembers, myJoinedAt) · mesh.broadcast(obj) · mesh.send(peerId, obj) · mesh.addStream(stream) · mesh.removeStream(stream)
//   mesh.setVideoLimit(bps, { width, height, fps }) · mesh.leave()
// Each peer: { id, name, pc, dc, ready, offset (their clock − mine, ms), streams: Map }.
export function createMesh({ api, base, me, local, ice, onPeer, onTrack, onMessage, onGone, onEnd, onState }) {
  const peers = new Map(), timers = new Set(), names = new Map(), extra = new Map();     // extra: streams added later (a shared screen)
  let cursor = '', left = false, lastMembers = 0, busyUntil = Date.now() + 20000, videoLimit = null, pollT = 0, polling = false, rejoining = null;
  const listed = new Set(), waiting = new Map();                                        // members now inside · those listed without a connection yet (since when)
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const post = (path, body) => api(base + path, { body });
  const signal = async (to, type, data) => {
    const body = { to, type, data: typeof data === 'string' ? data : JSON.stringify(data) };
    try { await post('/signal', body); } catch (e) { if (e.code === 'RTC_REJOIN') { await rejoin(); await post('/signal', body).catch(() => {}); } }
  };
  const gathered = (pc, ms = 2500) => new Promise((res) => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });

  // The poll is fast (1 s) while anyone is still connecting and for the first 20 s; once every member is connected
  // (and the data channel open) it only looks for newcomers every 20 s. A drop, a newcomer, a renegotiation or the
  // window coming back wakes it up at once; alone in the room, every 5 s so the first guest isn't kept waiting.
  // Polling costs the site nothing in Firestore, but it is still a request.
  function settled() {
    const now = Date.now();
    if (now < busyUntil) return false;
    for (const p of peers.values()) {
      const st = p.pc.connectionState; if (st === 'failed' || st === 'closed') continue;   // a failed peer is dropped on its own; it does not keep us fast
      if (st !== 'connected' || p.dc?.readyState !== 'open' || p.making || p.pc.signalingState !== 'stable') return false;
    }
    for (const since of waiting.values()) if (now - since < 30000) return false;         // someone listed who has not reached us yet
    return true;
  }
  function schedule(ms) { clearTimeout(pollT); timers.delete(pollT); pollT = setTimeout(() => { timers.delete(pollT); pollT = 0; poll(); }, ms); timers.add(pollT); }
  function wake(ms = 5000) { if (left) return; busyUntil = Math.max(busyUntil, Date.now() + ms); if (!polling) schedule(150); }
  async function poll() {
    if (left) return;
    polling = true;
    const calm = settled(), wantMembers = calm || Date.now() - lastMembers > 5000;
    try {
      const d = await api(`${base}/signal?since=${encodeURIComponent(cursor)}${wantMembers ? '&members=1' : ''}`);
      for (const s of d.signals || []) { cursor = s.createdAt; busyUntil = Math.max(busyUntil, Date.now() + 5000); await onSignal(s).catch((e) => console.warn('[rtc] signal', e)); }
      if (d.members) { lastMembers = Date.now(); members(d.members); }
    } catch (e) {
      if (e.code === 'RTC_REJOIN' || e.status === 403) await rejoin();                // the site forgot us (a restart): join again, the calls go on
      else if (e.status === 404) { polling = false; onEnd?.('ended'); return leave(true); }
    }
    polling = false;
    if (!left) schedule(!settled() ? 1000 : peers.size ? 20000 : 5000);                // an introduction in progress stays fast even in a hidden window
  }
  /** Join again quietly: live connections stay as they are. Refused with 403 — the host sent us out. */
  function rejoin() {
    return (rejoining ||= post('/presence', { action: 'join' }).then(() => wake())
      .catch((e) => { if (e.status === 403) { onEnd?.('kicked'); leave(true); } else if (e.status === 404) { onEnd?.('ended'); leave(true); } })
      .finally(() => { rejoining = null; }));
  }
  const beat = setInterval(() => { if (!left) post('/presence', { action: 'heartbeat' }).catch((e) => { if (e.status === 403 || e.code === 'RTC_REJOIN') rejoin(); }); }, 120000);
  const onVisible = () => { if (!document.hidden) wake(); };
  document.addEventListener('visibilitychange', onVisible);

  function members(list) {
    const now = Date.now(); let fresh = false;
    for (const m of list) {
      names.set(m.id, m); const p = peers.get(m.id); if (p && m.name && p.name !== m.name) { p.name = m.name; onState?.(p); }
      if (m.id !== me.id && !listed.has(m.id)) { listed.add(m.id); fresh = true; }
      if (m.id !== me.id && !p && !waiting.has(m.id)) waiting.set(m.id, now);
    }
    for (const id of [...listed]) if (!list.some((m) => m.id === id)) listed.delete(id);
    for (const id of [...waiting.keys()]) if (peers.has(id) || !listed.has(id)) waiting.delete(id);
    for (const [id, p] of peers) if (!list.some((m) => m.id === id) && p.pc.connectionState !== 'connected') drop(id);
    if (fresh) wake(20000);                                                             // a newcomer: stay quick while they connect
  }
  async function onSignal(s) {
    const data = (() => { try { return JSON.parse(s.data); } catch { return null; } })();
    if (s.type === 'offer' && data) {
      if (peers.has(s.from)) drop(s.from, true);
      const p = peer({ id: s.from, name: names.get(s.from)?.name || '' });
      await p.pc.setRemoteDescription(data); await p.pc.setLocalDescription(await p.pc.createAnswer()); await gathered(p.pc);
      await signal(s.from, 'answer', p.pc.localDescription);
    } else if (s.type === 'answer' && data) {
      const p = peers.get(s.from); if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription(data);
    } else if (s.type === 'candidate' && Array.isArray(data)) {
      const p = peers.get(s.from); for (const c of data) await p?.pc.addIceCandidate(c).catch(() => {});
    } else if (s.type === 'bye') drop(s.from);
  }
  async function call(m) {
    names.set(m.id, m); const p = peer(m);
    wire(p, p.pc.createDataChannel('vit', { ordered: true }));
    await p.pc.setLocalDescription(await p.pc.createOffer()); await gathered(p.pc);
    await signal(m.id, 'offer', p.pc.localDescription);
  }

  function peer(m) {
    const pc = new RTCPeerConnection({ iceServers: ice });
    const p = { id: m.id, name: m.name || '', pc, dc: null, ready: false, polite: me.id > m.id, making: false, ignore: false, streams: new Map(), offset: 0, rtts: [], senders: new Map() };
    peers.set(p.id, p);
    for (const t of local.getTracks()) pc.addTrack(t, local);
    for (const [sid, s] of extra) p.senders.set(sid, s.getTracks().map((t) => pc.addTrack(t, s)));
    pc.ontrack = (e) => { const s = e.streams[0] || new MediaStream([e.track]); p.streams.set(s.id, s); onTrack?.(p, s); };
    pc.ondatachannel = (e) => wire(p, e.channel);
    pc.onnegotiationneeded = async () => {
      if (!p.ready) return;                                                             // the first offer goes through the site
      wake();                                                                           // a screen or a file joins the call: keep an ear on the site meanwhile
      try { p.making = true; await pc.setLocalDescription(); send(p.id, { k: 'sdp', d: pc.localDescription }); } catch (e) { console.warn('[rtc] renegotiate', e); } finally { p.making = false; }
    };
    pc.onicecandidate = (e) => { if (p.ready && e.candidate) send(p.id, { k: 'ice', c: e.candidate }); };
    pc.onconnectionstatechange = () => { onState?.(p); if (pc.connectionState !== 'connected') wake(); else waiting.delete(p.id); if (pc.connectionState === 'failed') later(() => { if (pc.connectionState === 'failed') drop(p.id); }, 12000); if (pc.connectionState === 'connected') applyLimit(p); };
    onPeer?.(p); return p;
  }
  function wire(p, dc) {
    p.dc = dc;
    dc.onopen = () => { p.ready = true; for (let i = 0; i < 3; i++) setTimeout(() => send(p.id, { k: 'ping', a: Date.now() }), 300 * i); onState?.(p); onMessage?.(p, { k: 'open' }); };
    dc.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(p, m).catch((err) => console.warn('[rtc] dc', err)); };
    dc.onclose = () => { p.ready = false; if (!left) later(() => { if (p.pc.connectionState !== 'connected') drop(p.id); }, 4000); };
  }
  async function handle(p, m) {
    if (m.k === 'sdp') {                                                                // perfect negotiation over our own channel
      const collision = m.d.type === 'offer' && (p.making || p.pc.signalingState !== 'stable');
      p.ignore = !p.polite && collision; if (p.ignore) return;
      await p.pc.setRemoteDescription(m.d);
      if (m.d.type === 'offer') { await p.pc.setLocalDescription(); send(p.id, { k: 'sdp', d: p.pc.localDescription }); }
    } else if (m.k === 'ice') { try { await p.pc.addIceCandidate(m.c); } catch (e) { if (!p.ignore) console.warn('[rtc] ice', e); } }
    else if (m.k === 'ping') send(p.id, { k: 'pong', a: m.a, b: Date.now() });
    else if (m.k === 'pong') { const now = Date.now(), rtt = now - m.a; p.rtts.push([rtt, m.b - (m.a + rtt / 2)]); p.rtts.sort((x, y) => x[0] - y[0]); p.offset = p.rtts[0][1]; }
    else if (m.k === 'bye') drop(p.id);
    else onMessage?.(p, m);
  }
  function drop(id, quietly) {
    const p = peers.get(id); if (!p) return;
    peers.delete(id); try { p.pc.close(); } catch { /* closed */ }
    waiting.delete(id); wake();
    onGone?.(p, quietly);
  }
  const send = (id, m) => { const p = peers.get(id); if (p?.dc?.readyState === 'open') p.dc.send(JSON.stringify(m)); };
  const broadcast = (m) => { for (const id of peers.keys()) send(id, m); };

  /** Camera frames on the seats stay small: a mesh shares everyone's uplink. */
  function applyLimit(p) {
    if (!videoLimit) return;
    for (const s of p.pc.getSenders()) {
      if (s.track?.kind !== 'video' || [...p.senders.values()].flat().includes(s)) continue;
      const prm = s.getParameters(); if (!prm.encodings?.length) continue;
      prm.encodings[0].maxBitrate = videoLimit.bps; if (videoLimit.fps) prm.encodings[0].maxFramerate = videoLimit.fps; s.setParameters(prm).catch(() => {});
    }
  }
  function addStream(stream, bps) {
    extra.set(stream.id, stream);
    for (const p of peers.values()) {
      const ss = stream.getTracks().map((t) => p.pc.addTrack(t, stream)); p.senders.set(stream.id, ss);
      if (bps) for (const s of ss) if (s.track?.kind === 'video') { const prm = s.getParameters(); if (prm.encodings?.length) { prm.encodings[0].maxBitrate = bps; s.setParameters(prm).catch(() => {}); } }
    }
  }
  function removeStream(stream) {
    extra.delete(stream.id);
    for (const p of peers.values()) { for (const s of p.senders.get(stream.id) || []) { try { p.pc.removeTrack(s); } catch { /* closed */ } } p.senders.delete(stream.id); }
  }

  async function leave(ended) {
    if (left) return; left = true;
    broadcast({ k: 'bye' }); clearInterval(beat); timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVisible);
    for (const id of [...peers.keys()]) drop(id, true);
    if (!ended) fetch(base + '/presence', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'leave' }), keepalive: true }).catch(() => {});
  }

  return {
    peers, send, broadcast, addStream, removeStream, leave,
    /** Join done by the caller; the newcomer calls everyone who was inside before it. */
    start(list, myJoinedAt) { cursor = `${myJoinedAt}#0`;                              // offers left for an earlier visit are stale: read only what comes after joining
      members(list); for (const m of list) if (m.id !== me.id && (String(m.joinedAt) < String(myJoinedAt) || (m.joinedAt === myJoinedAt && m.id < me.id))) call(m).catch((e) => console.warn('[rtc] call', e)); poll(); },
    setVideoLimit(bps, opts = {}) { videoLimit = { bps, ...opts }; for (const p of peers.values()) applyLimit(p); },
    /** Their clock in my time: a message stamped `at` by peer p happened at at − p.offset here. */
    localTime: (p, at) => at - (p?.offset || 0),
    debug: () => [...peers.values()].map((p) => ({ id: p.id, name: p.name, conn: p.pc.connectionState, dc: p.dc?.readyState, offset: Math.round(p.offset) })),
    pace: () => ({ settled: settled(), busyFor: Math.max(0, busyUntil - Date.now()), waiting: [...waiting.keys()] }),
  };
}

/** A drawn camera and a soft tone instead of real devices (development: ?fake=1). */
export function fakeMedia(label, size = 360) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d'); let hu = 0; for (const ch of String(label)) hu = (hu * 31 + ch.charCodeAt(0)) % 360;
  const t0 = performance.now();
  const draw = () => { const t = (performance.now() - t0) / 1000, gr = g.createLinearGradient(0, 0, size, size);
    gr.addColorStop(0, `hsl(${hu},55%,30%)`); gr.addColorStop(1, `hsl(${(hu + 60) % 360},60%,14%)`); g.fillStyle = gr; g.fillRect(0, 0, size, size);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(size / 2 + Math.sin(t * 1.3) * size * 0.22, size * 0.45 + Math.cos(t * 0.9) * size * 0.12, size * 0.11, 0, 7); g.fill();
    g.font = `600 ${Math.round(size / 11)}px -apple-system, sans-serif`; g.textAlign = 'center'; g.fillText(String(label).split(' ')[0], size / 2, size * 0.88); };
  draw(); const iv = setInterval(draw, 1000 / 15);
  const track = c.captureStream(15).getVideoTracks()[0];
  const ac = new AudioContext(), o = ac.createOscillator(), gn = ac.createGain(), dest = ac.createMediaStreamDestination();
  o.frequency.value = 180 + (hu % 160); gn.gain.value = 0.01; o.connect(gn).connect(dest); o.start();
  const stream = new MediaStream([track, dest.stream.getAudioTracks()[0]]);
  stream.stopFake = () => { clearInterval(iv); try { o.stop(); ac.close(); } catch { /* closed */ } };
  return stream;
}
