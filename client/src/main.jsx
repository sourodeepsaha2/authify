import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const desk = sessionStorage.getItem('deskLabel') || `Desk-${Math.floor(1000 + Math.random() * 9000)}`;
sessionStorage.setItem('deskLabel', desk);
const tokens = new Map();
const timeLabel = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
function App() {
  const [slots, setSlots] = useState([]);
  const [serverTime, setServerTime] = useState(Date.now());
  const [online, setOnline] = useState(false);
  const [events, setEvents] = useState([]);
  const [patient, setPatient] = useState({});
  const [races, setRaces] = useState({});
  const previousHeld = useRef(new Set());
  const log = useCallback(message => setEvents(items => [{ id: Date.now() + Math.random(), message, at: new Date().toLocaleTimeString() }, ...items].slice(0, 12)), []);
  const poll = useCallback(async () => {
    try {
      const response = await fetch('/api/slots'); if (!response.ok) throw new Error('bad response');
      const data = await response.json();
      const heldNow = new Set(data.slots.filter(s => s.state === 'held' && tokens.has(s._id)).map(s => s._id));
      for (const id of previousHeld.current) if (!heldNow.has(id)) { tokens.delete(id); const slot = data.slots.find(s => s._id === id); if (slot?.state !== 'booked') log(`Your hold on ${slot ? timeLabel(slot.startsAt) : id} expired.`); }
      previousHeld.current = heldNow;
      setSlots(data.slots); setServerTime(new Date(data.serverTime).getTime()); setOnline(true);
    } catch { setOnline(false); }
  }, [log]);
  useEffect(() => { poll(); const id = setInterval(poll, 1000); const clock = setInterval(() => setServerTime(t => t + 1000), 1000); return () => { clearInterval(id); clearInterval(clock); }; }, [poll]);
  const update = slot => setSlots(old => old.map(item => item._id === slot._id ? slot : item));
  async function hold(slot) {
    setSlots(old => old.map(s => s._id === slot._id ? { ...s, state: 'held', heldBy: desk, holdExpiresAt: new Date(serverTime + 90000).toISOString() } : s));
    try {
      const res = await fetch(`/api/slots/${slot._id}/hold`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ heldBy: desk }) });
      const data = await res.json();
      if (res.status === 409) { await poll(); log(`Slot ${timeLabel(slot.startsAt)} was just taken by another desk.`); return; }
      if (!res.ok) throw new Error(data.error);
      tokens.set(slot._id, data.holdToken); previousHeld.current.add(slot._id); update(data.slot); log(`Hold on ${timeLabel(slot.startsAt)} acquired.`);
    } catch { await poll(); log(`Could not hold ${timeLabel(slot.startsAt)}; server unreachable.`); }
  }
  async function raceHold(slot) {
    const id = slot._id;
    setRaces(current => ({ ...current, [id]: { running: true, results: [] } }));
    log(`Race started: Demo Desk A and Demo Desk B are competing for ${timeLabel(slot.startsAt)}.`);
    try {
      const results = await Promise.all(['Demo Desk A', 'Demo Desk B'].map(async heldBy => {
        const response = await fetch(`/api/slots/${id}/hold`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ heldBy })
        });
        return { desk: heldBy, status: response.status, body: await response.json().catch(() => ({})) };
      }));
      const winner = results.find(result => result.status === 200);
      setRaces(current => ({ ...current, [id]: { running: false, results, winner: winner || null } }));
      await poll();
      const losing = results.find(result => result.status === 409);
      if (winner && losing) log(`${winner.desk} won ${timeLabel(slot.startsAt)}; ${losing.desk} received 409 Conflict.`);
      else log(`Race finished for ${timeLabel(slot.startsAt)}. Check the outcomes on the slot card.`);
    } catch {
      setRaces(current => ({ ...current, [id]: { running: false, results: [], error: true } }));
      await poll();
      log(`Could not complete the two-desk race for ${timeLabel(slot.startsAt)}.`);
    }
  }
  async function releaseRaceHold(slot) {
    const race = races[slot._id];
    if (!race?.winner?.body?.holdToken) return;
    try {
      const response = await fetch(`/api/slots/${slot._id}/release`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ holdToken: race.winner.body.holdToken })
      });
      if (!response.ok) throw new Error('release_failed');
      setRaces(current => ({ ...current, [slot._id]: { ...current[slot._id], winner: null } }));
      await poll();
      log(`Released the demo hold on ${timeLabel(slot.startsAt)} so you can run the race again.`);
    } catch {
      await poll();
      log(`Could not release the demo hold on ${timeLabel(slot.startsAt)}.`);
    }
  }
  async function action(slot, kind) {
    const body = { holdToken: tokens.get(slot._id) };
    if (kind === 'confirm') body.patientName = patient[slot._id] || '';
    try {
      const res = await fetch(`/api/slots/${slot._id}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { log(`${kind === 'confirm' ? 'Confirm' : 'Release'} failed: ${data.reason || data.error}.`); await poll(); return; }
      update(data.slot); tokens.delete(slot._id); previousHeld.current.delete(slot._id);
      log(`${kind === 'confirm' ? `Confirmed ${patient[slot._id]} at` : 'Released'} ${timeLabel(slot.startsAt)}.`);
    } catch { setOnline(false); log('Server unreachable; retrying.'); }
  }
  return <main>
    <header><div><h1>Seat-Hold Board</h1><p>{desk} · Dr. Sharma · November 5, 2026</p></div><strong className={online ? 'online' : 'offline'}>{online ? '● Connected' : '● Server unreachable'}</strong></header>
    <section className="grid">{slots.map(slot => {
      const own = slot.state === 'held' && slot.heldBy === desk && tokens.has(slot._id);
      const seconds = slot.holdExpiresAt ? Math.max(0, Math.ceil((new Date(slot.holdExpiresAt).getTime() - serverTime) / 1000)) : 0;
      return <article key={slot._id} className={`slot ${slot.state}`}><div className="slothead"><b>{timeLabel(slot.startsAt)}</b><span className="badge">{slot.state}</span></div>
        {slot.state === 'held' && <p>{own ? 'Held by you' : `Held by ${slot.heldBy}`} {seconds > 0 && `· ${seconds}s`}</p>}
        {slot.state === 'booked' && <p>Booked · {slot.patientName}</p>}
        {slot.state === 'free' && <div className="actions"><button onClick={() => hold(slot)}>Hold slot</button><button className="secondary" disabled={races[slot._id]?.running} onClick={() => raceHold(slot)}>{races[slot._id]?.running ? 'Racing…' : 'Simulate two desks'}</button></div>}
        {own && <div className="actions"><input aria-label="Patient name" placeholder="Patient name" value={patient[slot._id] || ''} onChange={e => setPatient({ ...patient, [slot._id]: e.target.value })}/><button onClick={() => action(slot, 'confirm')} disabled={!(patient[slot._id] || '').trim()}>Confirm</button><button className="secondary" onClick={() => action(slot, 'release')}>Release</button></div>}
        {races[slot._id] && <div className="race-result" aria-live="polite"><b>Two-desk race</b>{races[slot._id].running ? <p>Both hold requests were sent concurrently…</p> : races[slot._id].error ? <p>Could not reach the server. Check the connection and try again.</p> : <><ul>{races[slot._id].results.map(result => <li key={result.desk}><b>{result.desk}:</b> {result.status === 200 ? '200 — hold won' : result.status === 409 ? '409 — slot taken' : `${result.status} — request failed`}</li>)}</ul>{races[slot._id].winner && <button className="secondary" onClick={() => releaseRaceHold(slot)}>Release demo hold</button>}</>}</div>}
      </article>;
    })}</section>
    <aside><h2>Recent activity</h2>{events.length ? <ul>{events.map(event => <li key={event.id}><time>{event.at}</time> {event.message}</li>)}</ul> : <p>Actions and hold expiry will appear here.</p>}</aside>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
