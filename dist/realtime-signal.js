/* Supabase Phoenix protocol 1.0.0; subscribe only to revision metadata. */
(() => {
  window.KaixinSignal = function({url, key, onRevision, onReady, onState}) {
    let socket=null, timer=null, heartbeat=null, joinTimeout=null, enabled=false, attempt=0, ref=0, awaiting=null;
    const topic='realtime:kaixin-revision';
    const clear=()=>{clearTimeout(timer);clearTimeout(heartbeat);clearTimeout(joinTimeout);};
    function stop(){enabled=false;clear();const old=socket;socket=null;if(old)old.close();onState(false);}
    function connect(){
      if(!enabled || socket)return;
      let ws;
      try{ws=new WebSocket(url.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(key)+'&vsn=1.0.0');}
      catch(_){retry();return;}
      socket=ws;awaiting=null;
      const send=(event,payload,t=topic)=>{const id=String(++ref);ws.send(JSON.stringify({topic:t,event,payload,ref:id}));return id;};
      let joinRef;
      const beat=()=>{if(socket!==ws)return;if(awaiting){ws.close();return;}awaiting=send('heartbeat',{},'phoenix');heartbeat=setTimeout(beat,25000);};
      joinTimeout=setTimeout(()=>ws.close(),15000);
      ws.onopen=()=>{joinRef=send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[{event:'*',schema:'public',table:'kaixin_sync_signal',filter:'id=eq.KAIXIN'}],private:false}});heartbeat=setTimeout(beat,25000);};
      ws.onmessage=e=>{
        if(socket!==ws)return;
        let m;try{m=JSON.parse(e.data);}catch(_){return;}
        if(m.event==='phx_reply' && m.ref===awaiting){awaiting=null;return;}
        if(m.topic!==topic)return;
        if(m.event==='phx_reply' && m.ref===joinRef){
          if(m.payload?.status!=='ok' || !m.payload?.response?.postgres_changes?.length){ws.close();return;}
          clearTimeout(joinTimeout);attempt=0;onState(true);onReady();
        }
        if(m.event==='postgres_changes'){
          const d=m.payload?.data;
          if(d?.schema==='public' && d.table==='kaixin_sync_signal' && d.record?.id==='KAIXIN' && Number.isInteger(d.record.revision))onRevision(d.record.revision);
        }
        if(m.event==='phx_error'||m.event==='phx_close'||(m.event==='system'&&m.payload?.status==='error'))ws.close();
      };
      ws.onerror=()=>ws.close();
      ws.onclose=()=>{if(socket!==ws)return;socket=null;clear();onState(false);retry();};
    }
    function retry(){if(enabled)timer=setTimeout(connect,Math.min(300000,5000*2**Math.min(attempt++,6)));}
    return {start(){enabled=true;connect();},stop};
  };
})();
