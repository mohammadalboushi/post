import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, push, set, update, remove, onDisconnect, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const app = initializeApp({ 
    apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY", 
    authDomain: "malaboushi.firebaseapp.com", 
    databaseURL: "https://malaboushi-default-rtdb.firebaseio.com/", 
    projectId: "malaboushi", 
    storageBucket: "malaboushi.firebasestorage.app" 
});
const db = getDatabase(app);

window.showToast = msg => { 
    document.getElementById('toast-msg').innerText = msg; 
    document.getElementById('toast').classList.add('show'); 
    setTimeout(() => document.getElementById('toast').classList.remove('show'), 3000); 
};

window.toggleTheme = () => {
    if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', 'dark');
    }
};

let isAudioPlaying = false;
document.addEventListener('play', e => { if(e.target.tagName === 'AUDIO') isAudioPlaying = true; }, true);
document.addEventListener('pause', e => { if(e.target.tagName === 'AUDIO') isAudioPlaying = false; }, true);
document.addEventListener('ended', e => { if(e.target.tagName === 'AUDIO') { isAudioPlaying = false; renderPosts(document.getElementById('searchInput').value); } }, true);

let allFetchedPosts = [];
onValue(ref(db, 'posts'), snap => {
    const data = snap.val();
    if(data) {
        allFetchedPosts = Object.entries(data)
            .map(([k,v]) => ({id:k, ...v}))
            .filter(post => !post.isHidden)
            .sort((a, b) => {
                if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
                return (a.order || 0) - (b.order || 0);
            });
    } else {
        allFetchedPosts = [];
    }
    renderPosts(document.getElementById('searchInput').value);
});

document.getElementById('searchInput').oninput = e => renderPosts(e.target.value);

function renderPosts(query = '') {
    if (isAudioPlaying) return; 
    const container = document.getElementById('feedContainer'); 
    container.innerHTML = '';
    let filtered = query ? allFetchedPosts.filter(p => (p.title||'').includes(query) || (p.content||'').includes(query)) : allFetchedPosts;
    
    const badge = document.getElementById('postCountBadge');
    if(badge) badge.innerText = filtered.length + ' منشور';
    
    filtered.forEach(post => {
        const card = document.createElement('div'); 
        card.className = 'post-card';
        card.innerHTML = `
            <div class="card-body">
                <div style="font-size:0.8rem; color:var(--ink-muted); margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                    <span>${new Date(post.timestamp).toLocaleDateString('ar-EG')}</span>
                    <div style="display:flex; gap:10px; align-items:center;">
                        ${post.audioUrl ? `<span style="color:var(--accent); font-weight:bold;"><i class="fas fa-play"></i> ${post.playCount || 0}</span>` : ''}
                        ${post.content ? `<button onclick="copyPostText('${post.id}')" style="background:var(--surface-alt); border:1px solid var(--border); color:var(--ink-muted); padding:6px 12px; border-radius:50px; font-family:inherit; font-weight:bold; cursor:pointer; font-size:0.75rem; transition:0.2s;"><i class="far fa-copy"></i> نسخ النص</button>` : ''}
                    </div>
                </div>
                ${post.title ? `<div class="post-title">${post.isPinned ? '<i class="fas fa-thumbtack" style="color:var(--pinned); margin-left:6px; font-size:0.9rem;"></i>' : ''}${post.title}</div>` : ''}
                ${post.imageUrl ? `<img src="${post.imageUrl}" class="post-image">` : ''}
                ${post.audioUrl ? `<div onclick="event.stopPropagation()"><audio controls src="${post.audioUrl}" onplay="incrementPlayCount('${post.id}', event)" style="width:100%; outline:none; margin-bottom:15px;"></audio></div>` : ''}
                <div class="post-content">${post.content}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.incrementPlayCount = (id, event) => {
    update(ref(db, `posts/${id}`), { playCount: (allFetchedPosts.find(p=>p.id===id).playCount || 0) + 1 });
    event.target.removeAttribute('onplay');
};

window.copyPostText = (id) => {
    const post = allFetchedPosts.find(p => p.id === id);
    if(post && post.content) {
        navigator.clipboard.writeText(post.content).then(() => {
            showToast("تم نسخ النص بنجاح! 📋");
        }).catch(err => {
            showToast("حدث خطأ بالنسخ");
        });
    }
};

const AGORA_APP_ID = "7ca23eb56dfd45f7a89e9fd2a03a40ca";
let rtcClient = null; 
let localMicTrack = null; 
let isListening = false;
let isBroadcastHiddenGlobal = false;
let visitorId = localStorage.getItem('myRadioVisitorId');
if(!visitorId) { 
    visitorId = "user_" + Math.floor(Math.random() * 1000000); 
    localStorage.setItem('myRadioVisitorId', visitorId); 
}
let visitorName = localStorage.getItem('myRadioVisitorName') || "";

let visitorTimerInterval = null;
let visitorAudioCtx = null;
let visitorAnalyser = null;

onValue(ref(db, 'liveData/status'), snap => {
    const data = snap.val();
    if(data) isBroadcastHiddenGlobal = !!data.isHidden;
    
    if(data && data.isLive) {
        if(data.isHidden && !isListening) {
            document.getElementById('headerLiveControls').style.display = 'none';
        } else {
            document.getElementById('headerLiveControls').style.display = 'flex';
        }
    } else {
        document.getElementById('headerLiveControls').style.display = 'none';
        leaveBroadcast();
        clearInterval(visitorTimerInterval);
        document.getElementById('visitorTimer').innerText = "00:00";
    }

    if (data && data.isLive && data.startedAt) {
        clearInterval(visitorTimerInterval);
        visitorTimerInterval = setInterval(() => {
            let diff = Math.floor((Date.now() - data.startedAt) / 1000);
            let m = Math.floor(diff / 60).toString().padStart(2, '0');
            let s = (diff % 60).toString().padStart(2, '0');
            document.getElementById('visitorTimer').innerText = `${m}:${s}`;
        }, 1000);
    }
});

onValue(ref(db, `liveData/kicked/${visitorId}`), snap => {
    if(snap.exists()) {
        leaveBroadcast();
        showToast("تم طردك من البث من قبل الإدارة.");
        remove(ref(db, `liveData/kicked/${visitorId}`)); 
    }
});

window.joinBroadcast = async () => {
    if (!visitorName) {
        const namePrompt = document.createElement('div');
        namePrompt.innerHTML = `
            <style>
                @keyframes popInModal {
                    0% { opacity: 0; transform: scale(0.85) translateY(20px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                .modern-input:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 4px var(--accent-light) !important; }
                .modern-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(232, 80, 26, 0.3) !important; filter: brightness(1.1); }
                .modern-btn-secondary:hover { background: var(--border) !important; color: var(--ink) !important; }
            </style>
            <div class="modal-overlay" style="display:flex; z-index: 10000; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);">
                <div style="background: var(--surface); padding: 35px 25px; border-radius: 28px; width: 90%; max-width: 340px; text-align: center; box-shadow: 0 24px 60px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.4); border: 1px solid var(--border); animation: popInModal 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                    
                    <div style="width: 76px; height: 76px; background: linear-gradient(135deg, var(--accent-light), var(--surface-alt)); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 10px 25px var(--accent-light), inset 0 2px 4px rgba(255,255,255,0.5);">
                        <i class="fas fa-headphones-alt" style="font-size: 2.2rem; color: var(--accent);"></i>
                    </div>
                    
                    <h3 style="margin-bottom: 8px; font-weight: 900; font-size: 1.4rem; color: var(--ink); letter-spacing: -0.02em;">تسجيل دخول للبث</h3>
                    <p style="color: var(--ink-muted); font-size: 0.88rem; margin-bottom: 24px; line-height: 1.6;">أهلاً بك! يرجى إدخال اسمك للمشاركة.</p>
                    
                    <div style="position: relative; margin-bottom: 24px;">
                        <i class="fas fa-user" style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: var(--ink-faint); font-size: 1rem;"></i>
                        <input type="text" id="tempNameInput" class="modern-input" placeholder="اكتب اسمك هنا..." style="width: 100%; padding: 15px 42px 15px 15px; border-radius: 16px; border: 2px solid var(--border); background: var(--surface-alt); color: var(--ink); font-family: inherit; font-size: 1rem; font-weight: 700; outline: none; transition: 0.3s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                    </div>
                    
                    <div style="display: flex; gap: 12px;">
                        <button id="cancelNameBtn" class="modern-btn-secondary" style="flex: 1; padding: 14px; border-radius: 16px; border: none; background: var(--surface-alt); color: var(--ink-muted); font-family: inherit; font-weight: 800; font-size: 0.95rem; cursor: pointer; transition: 0.2s;">إلغاء</button>
                        <button id="confirmNameBtn" class="modern-btn-primary" style="flex: 1.5; padding: 14px; border-radius: 16px; border: none; background: var(--accent); color: white; font-family: inherit; font-weight: 800; font-size: 0.95rem; cursor: pointer; box-shadow: 0 8px 20px var(--accent-light); transition: 0.2s;">دخول البث <i class="fas fa-arrow-left" style="margin-right: 6px; font-size: 0.85rem;"></i></button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(namePrompt);

        document.getElementById('cancelNameBtn').onclick = () => namePrompt.remove();
        document.getElementById('confirmNameBtn').onclick = () => {
            const n = document.getElementById('tempNameInput').value.trim();
            if(n) {
                visitorName = n;
                namePrompt.remove();
                executeJoin();
            } else {
                showToast("الرجاء إدخال اسم صالح!");
            }
        };
    } else {
        executeJoin();
    }
};

async function executeJoin() {
    const statusSnap = await get(ref(db, 'liveData/status'));
    const statusData = statusSnap.val();
    if (statusData && statusData.isHidden && !isListening) {
        showToast("البث مخفي حالياً، لا يمكنك الانضمام");
        return;
    }

    try {
        if(!rtcClient) {
            rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
            rtcClient.on("user-published", async (user, mediaType) => {
                await rtcClient.subscribe(user, mediaType);
                if (mediaType === "audio") {
                    user.audioTrack.play();
                    
                    try {
                        if(!visitorAudioCtx) visitorAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        const stream = new MediaStream([user.audioTrack.getMediaStreamTrack()]);
                        const source = visitorAudioCtx.createMediaStreamSource(stream);
                        visitorAnalyser = visitorAudioCtx.createAnalyser();
                        visitorAnalyser.fftSize = 256;
                        source.connect(visitorAnalyser);
                        drawVisitorVisualizer();
                    } catch(e) { console.error("Visualizer Error:", e); }
                }
            });
        }
        await rtcClient.join(AGORA_APP_ID, "abu_fayez_radio", null, visitorId);
        isListening = true;
        
                localStorage.setItem('myRadioVisitorName', visitorName);
        
        const connectedRef = ref(db, '.info/connected');
        if(window.presenceListener) window.presenceListener(); 
        
        window.presenceListener = onValue(connectedRef, (snap) => {
            if (snap.val() === true && isListening) {
                const viewerRef = ref(db, 'liveData/viewers/' + visitorId);
                set(viewerRef, { name: visitorName, joinedAt: Date.now() });
                onDisconnect(viewerRef).remove();

                if (window.chatDisconnectRef) onDisconnect(window.chatDisconnectRef).cancel();
                window.chatDisconnectRef = push(ref(db, 'liveData/chat'));
                onDisconnect(window.chatDisconnectRef).set({
                    senderId: 'system', name: '', text: ` ${visitorName} `, timestamp: { ".sv": "timestamp" }
                });
            }
        });

        push(ref(db, 'liveData/chat'), {
            senderId: 'system', name: '', text: ` ${visitorName}  !`, timestamp: Date.now()
        });


        showToast("تم دخول البث بنجاح 🎧");
        document.getElementById('btnHeaderJoin').style.display = 'none';
        document.getElementById('headerListeningControls').style.display = 'flex';
        
        openLiveInteraction();
        
        if(typeof updateVisitorMedia === 'function') updateVisitorMedia();
        
    } catch (e) { 
        console.error(e);
        showToast("حدث خطأ بالاتصال"); 
    }
}

function drawVisitorVisualizer() {
    const canvas = document.getElementById("visitorVisualizer");
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 20;

    function draw() {
        if(!isListening) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        requestAnimationFrame(draw);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if(visitorAnalyser) {
            const dataArray = new Uint8Array(visitorAnalyser.frequencyBinCount);
            visitorAnalyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
            let vol = sum / dataArray.length; 
            
            ctx.fillStyle = "var(--accent)";
            let barWidth = Math.max(0, Math.min(canvas.width, vol * 2.5));
            ctx.fillRect(canvas.width/2 - barWidth/2, 5, barWidth, 10);
        }
    }
    draw();
}

window.leaveBroadcast = () => {
    if(!isListening) return;
    if(localMicTrack) { localMicTrack.close(); localMicTrack = null; }
    if(rtcClient) rtcClient.leave();
    isListening = false;
    
    if(window.presenceListener) { window.presenceListener(); window.presenceListener = null; } 
    
    if(isBroadcastHiddenGlobal) {
        document.getElementById('headerLiveControls').style.display = 'none';
    } else {
        document.getElementById('btnHeaderJoin').style.display = 'flex';
        document.getElementById('headerListeningControls').style.display = 'none';
    }
    
    closeLiveInteraction();
    if(typeof updateVisitorMedia === 'function') updateVisitorMedia(); 
    remove(ref(db, `liveData/requests/${visitorId}`)); 
    remove(ref(db, `liveData/viewers/${visitorId}`));
    
    if(window.chatDisconnectRef) onDisconnect(window.chatDisconnectRef).cancel();
    
    if(visitorName) {
        push(ref(db, 'liveData/chat'), { senderId: 'system', name: '', text: ` ${visitorName} `, timestamp: Date.now() });
    }
};


window.promptLeaveBroadcast = () => {
    document.getElementById('leaveConfirmModal').style.display = 'flex';
};

window.confirmLeaveBroadcast = () => {
    document.getElementById('leaveConfirmModal').style.display = 'none';
    leaveBroadcast(); 
};

window.openLiveInteraction = () => {
    document.getElementById('liveInteractionModal').style.display = 'flex';
    document.body.classList.add('modal-open');
};

window.closeLiveInteraction = () => {
    document.getElementById('liveInteractionModal').style.display = 'none';
    document.body.classList.remove('modal-open');
};

onValue(ref(db, 'liveData/viewers'), snap => {
    const data = snap.val();
    const countSpan = document.getElementById('visitorViewersCount');
    const vList = document.getElementById('visitorViewersList');
    if(countSpan) countSpan.innerText = data ? Object.keys(data).length : '0';
    if(vList) {
        vList.innerHTML = '';
        if(data) {
            Object.values(data).forEach(v => {
                vList.innerHTML += `<div style="padding: 10px; border-bottom: 1px solid var(--border); font-weight: bold;"><i class="fas fa-user-circle" style="color: var(--ink-faint); margin-left: 5px;"></i> ${v.name}</div>`;
            });
        } else {
            vList.innerHTML = '<div style="text-align:center; color: var(--ink-faint);">لا يوجد مستمعين</div>';
        }
    }
});

window.openVisitorViewersList = () => {
    document.getElementById('visitorViewersModal').style.display = 'flex';
};

window.sendChatMsg = () => {
    const inputField = document.getElementById('chatMsgInput');
    const msg = inputField.value.trim(); if(!msg) return;
    push(ref(db, 'liveData/chat'), { senderId: visitorId, name: visitorName||"ضيف", text: msg, timestamp: Date.now() });
    inputField.value = '';
    inputField.focus(); 
};

onValue(ref(db, 'liveData/chat'), snap => {
    const list = document.getElementById('chatList'); 
    list.innerHTML = '';
    const data = snap.val(); if(!data) return;
    Object.values(data).sort((a,b)=>a.timestamp-b.timestamp).forEach(m => {
        const isMe = m.senderId === visitorId;
        const isAdmin = m.senderId === 'admin';
        const isSystem = m.senderId === 'system';
        
        if(isSystem) {
            list.innerHTML += `
                <div class="chat-bubble system-bubble">
                    <span class="chat-sender" style="color: var(--ink-muted);"><i class="fas fa-info-circle"></i> النظام</span>
                    <span class="chat-text" style="color: var(--ink-muted); font-size: 0.8rem;">${m.text}</span>
                </div>
            `;
            return;
        }

        list.innerHTML += `
            <div class="chat-bubble ${isMe ? 'mine' : ''}">
                <span class="chat-sender" style="${isAdmin ? 'color: var(--danger);' : ''}">${isAdmin ? '👑 ' : ''}${m.name}</span>
                <span class="chat-text" style="${isAdmin ? 'color: var(--danger);' : ''}">${m.text}</span>
            </div>
        `;
    });
    list.scrollTop = list.scrollHeight;
});

let micStatus = 'none'; 
window.handleVisitorMicClick = () => {
    if(micStatus === 'none') {
        if(!visitorName) {
            showToast("يجب إدخال اسمك لطلب المايك");
            return;
        }
        set(ref(db, `liveData/requests/${visitorId}`), { name: visitorName, status: 'pending', timestamp: Date.now() });
        
        push(ref(db, 'liveData/chat'), {
            senderId: 'system', name: 'الراديو', text: `طلب ${visitorName} التحدث بالمايك!`, timestamp: Date.now()
        });
        
        showToast("تم إرسال طلب المايك");
    } else if(micStatus === 'pending' || micStatus === 'approved') {
        document.getElementById('micCancelConfirmModal').style.display = 'flex';
    }
};

window.confirmMicCancel = () => {
    document.getElementById('micCancelConfirmModal').style.display = 'none';
    remove(ref(db, `liveData/requests/${visitorId}`));
    
    push(ref(db, 'liveData/chat'), {
        senderId: 'system', name: 'الراديو', text: `ألغى ${visitorName} طلب المايك!`, timestamp: Date.now()
    });
    
    showToast("تم إلغاء طلب المايك");
};

onValue(ref(db, `liveData/requests/${visitorId}`), async snap => {
    const data = snap.val();
    const micBtn = document.getElementById('floatingMicBtn');
    if(!data) { 
        micStatus = 'none';
        if(micBtn) {
            micBtn.style.background = 'var(--surface-alt)';
            micBtn.style.color = 'var(--ink-muted)';
            micBtn.style.borderColor = 'var(--border)';
            micBtn.innerHTML = '<i class="fas fa-microphone"></i> <span>طلب المايك</span>';
        }
        if(localMicTrack){
            localMicTrack.close(); localMicTrack=null; 
            if(rtcClient) await rtcClient.unpublish(); 
            showToast("تم إغلاق المايك من الإدارة");
        } 
        return; 
    }
    
    if(data.status === 'pending') {
        micStatus = 'pending';
        if(micBtn) {
            micBtn.style.background = 'var(--warning)';
            micBtn.style.color = '#000';
            micBtn.style.borderColor = 'var(--warning)';
            micBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> <span>قيد الانتظار</span>';
        }
    } else if(data.status === 'approved') {
        micStatus = 'approved';
        if(micBtn) {
            micBtn.style.background = 'var(--success)';
            micBtn.style.color = '#fff';
            micBtn.style.borderColor = 'var(--success)';
            micBtn.innerHTML = '<i class="fas fa-microphone-alt"></i> <span>المايك مفتوح</span>';
        }
        if(!localMicTrack) {
            showToast("تم فتح المايك معك! 🎙️");
            localMicTrack = await AgoraRTC.createMicrophoneAudioTrack({ AEC: false, ANS: false });
            if(rtcClient) await rtcClient.publish([localMicTrack]);
        }
    }
});

const ytTag = document.createElement('script');
ytTag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(ytTag, firstScriptTag);

let ytPlayerVisitor;
let isYtReady = false;

window.onYouTubeIframeAPIReady = () => {
    isYtReady = true;
};

let currentMediaData = null;
onValue(ref(db, 'liveData/media'), (snap) => {
    currentMediaData = snap.val();
    updateVisitorMedia();
});

window.updateVisitorMedia = () => {
    const data = currentMediaData;
    const container = document.getElementById('visitorMediaContainer');
    const ytPlayer = document.getElementById('ytVisitorPlayer');
    const ytAudio = document.getElementById('ytVisitorAudio');
    
    if (!data || !isListening) {
        if(container) container.style.display = 'none';
        if (ytPlayerVisitor && ytPlayerVisitor.stopVideo) ytPlayerVisitor.stopVideo();
        const localVid = document.getElementById('visitorLocalVideo');
        if(localVid) { localVid.pause(); localVid.remove(); }
        return;
    }

    if(container) {
        container.style.display = 'block';
        
        if (data.type === 'youtube') {
            if (data.display === 'audio') {
                ytPlayer.style.display = 'none';
                ytAudio.style.display = 'flex';
                ytAudio.style.height = '80px';
                ytAudio.innerHTML = '<i class="fas fa-music fade-anim"></i>';
            } else {
                ytPlayer.style.display = 'block';
                ytAudio.style.display = 'none';
            }
            
            if (!ytPlayerVisitor && isYtReady) {
                ytPlayerVisitor = new YT.Player('ytVisitorPlayer', {
                    height: '100%', width: '100%', videoId: data.url,
                    playerVars: { 'controls': 0, 'disablekb': 1, 'rel': 0, 'playsinline': 1 },
                    events: { 'onReady': (e) => syncVisitorPlayer(e.target, data) }
                });
            } else if (ytPlayerVisitor && ytPlayerVisitor.getVideoData) {
                syncVisitorPlayer(ytPlayerVisitor, data);
            }
        } else if (data.type === 'local') {
            ytPlayer.style.display = 'none';
            ytAudio.style.display = 'flex';
            ytAudio.style.height = '220px'; 
            
            if (data.display === 'image') {
                ytAudio.innerHTML = `<img src="${data.url}" style="max-width:100%; max-height:220px; border-radius:10px; object-fit:contain;">`;
            } else if (data.display === 'video') {
                if(!document.getElementById('visitorLocalVideo')) {
                    ytAudio.innerHTML = `<video id="visitorLocalVideo" src="${data.url}" style="width:100%; max-height:220px; border-radius:10px; object-fit:contain;" muted playsinline></video>`;
                }
                const localVid = document.getElementById('visitorLocalVideo');
                if (localVid.src !== data.url) localVid.src = data.url;
                
                if(data.state === 'playing') {
                    localVid.play().catch(e=>console.log(e));
                    let expectedTime = data.time + ((Date.now() - data.ts) / 1000);
                    if (Math.abs(localVid.currentTime - expectedTime) > 2) {
                        localVid.currentTime = expectedTime;
                    }
                } else {
                    localVid.pause();
                }
            }
        }
    }
};

function syncVisitorPlayer(player, data) {
    const currentUrl = player.getVideoData().video_id;
    if (currentUrl !== data.url) {
        player.loadVideoById(data.url, data.time);
    }

    if(data.volume !== undefined && player.setVolume) {
        if(data.volume == 0) {
            player.mute();
        } else {
            player.unMute();
            player.setVolume(data.volume);
        }
    }

    if (data.state === 'playing') {
        player.playVideo();
        let expectedTime = data.time + ((Date.now() - data.ts) / 1000);
        const diff = Math.abs(player.getCurrentTime() - expectedTime);
        if (diff > 4) {
            player.seekTo(expectedTime, true); 
        }
    } else if (data.state === 'paused') {
        player.pauseVideo();
    }
}

onValue(ref(db, 'liveData/requests'), snap => {
    const data = snap.val();
    let guestName = null;
    if(data) {
        Object.values(data).forEach(req => {
            if(req.status === 'approved') {
                guestName = req.name;
            }
        });
    }
    const titleEl = document.getElementById('liveRoomTitle');
    if(titleEl) {
        if(guestName) {
            titleEl.innerHTML = `<i class="fas fa-broadcast-tower" style="color: var(--danger);"></i> بث أبو فايز & ${guestName}`;
        } else {
            titleEl.innerHTML = `<i class="fas fa-broadcast-tower" style="color: var(--danger);"></i> بث أبو فايز`;
        }
    }
});
