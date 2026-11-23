'use client';
import {useEffect,useState} from 'react';
import {API_BASE,api} from '@/lib/api/client';
import type {Event} from '@/types';

/** WebSocket stream + REST replay; duplicate seq numbers are ignored. */
export function useJourneyEvents(journeyId:string){
  const [events,setEvents]=useState<Event[]>([]);
  useEffect(()=>{
    let stopped=false;let socket:WebSocket|undefined;
    let reconnect:ReturnType<typeof setTimeout>|undefined;
    let lastSeq=0;
    function merge(items:Event[]){
      if(stopped)return;
      setEvents(prev=>{
        const seen=new Map<number,Event>([...prev,...items].map(ev=>[ev.seq,ev]));
        return Array.from(seen.values()).sort((a,b)=>a.seq-b.seq);
      });
      lastSeq=Math.max(lastSeq,...items.map(e=>e.seq),0);
    }
    async function replay(){try{merge((await api.events(journeyId,lastSeq)).events)}catch{/* Next poll will retry */}}
    function connect(){
      if(stopped)return;
      const url=API_BASE.replace(/^http/,'ws')+`/ws/journeys/${journeyId}?since_seq=${lastSeq}`;
      socket=new WebSocket(url);
      socket.onmessage=e=>{try{merge([JSON.parse(e.data) as Event])}catch{/* malformed event ignored */}};
      socket.onclose=()=>{if(!stopped){replay();reconnect=setTimeout(connect,1800)}};
      socket.onerror=()=>socket?.close();
    }
    replay();connect();
    const fallback=setInterval(replay,3000);
    return ()=>{stopped=true;clearInterval(fallback);if(reconnect)clearTimeout(reconnect);socket?.close()};
  },[journeyId]);
  return events;
}
