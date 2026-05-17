import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, update, remove, onValue, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY",
    authDomain: "malaboushi.firebaseapp.com",
    databaseURL: "https://malaboushi-default-rtdb.firebaseio.com/",
    projectId: "malaboushi",
    storageBucket: "malaboushi.firebasestorage.app",
    messagingSenderId: "110336819350",
    appId: "1:110336819350:web:2b1b0488e72b811f0602b7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const myUID = "EFrGJwUdnlZDQ4A7GGIEh2VgoyK2";

let allPosts = {};
let editingPostId = null;
let postToDelete = null;
let swapSourceKey = null;
let allPostsArray = [];

// متغيرات التسجيل والصدى
let mediaRecorder;
let audioChunks = [];
let recordedAudioBlob = null;
let audioCtx = null;
let mediaElementSource = null;
let wetGainNode = null;
let dryGainNode = null;
let convolverNode = null;

window.showToast = (msg, type = "success") => {
    const toast = document.getElementById("toast");
    document.getElementById("toastMsg").innerText = msg;
    const dot = document.getElementById("toastDot");
    dot.className = `toast-dot ${type}`;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
};

document.getElementById('postContent').addEventListener('input', function() {
    const len = this.value.length;
    const counter = document.getElementById('charCounter');
    counter.textContent = `${len.toLocaleString('ar-EG')} حرف`;
    counter.className = 'char-counter' + (len > 2000 ? ' warn' : '');
});

onAuthStateChanged(auth, (user) => {
    if (user && user.uid === myUID) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('app-shell').style.display = 'grid';
        document.getElementById('userName').textContent = user.displayName || 'المدير';
        const initial = (user.displayName || 'A')[0];
        document.getElementById('userAvatar').textContent = initial;
        
        // مسح الدردشة القديمة عند دخول المدير
        remove(ref(db, 'liveData/chat'));
        
        loadPosts();

        setTimeout(() => {
            if(sessionStorage.getItem('autoRejoinAdminLive') === 'true') {
                sessionStorage.removeItem('autoRejoinAdminLive');
                document.getElementById('startLiveBtn').click();
                document.getElementById('liveStudioModal').style.display = 'flex';
            }
        }, 1000);
    } else {
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
    }
});

        document.getElementById('loginBtn').onclick = () => {
            const btn = document.getElementById('loginBtn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري فتح نافذة جوجل...';
            
            signInWithPopup(auth, provider).catch(error => {
                alert("صار خطأ بتسجيل الدخول: " + error.message);
                btn.innerHTML = 'متابعة مع Google';
            });
        };

document.getElementById('logoutBtn').onclick = () => signOut(auth);
document.getElementById('logoutTopBtn').onclick = () => signOut(auth);

document.getElementById('searchInput').addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    renderList(q ? allPostsArray.filter(p =>
        (p.title || '').toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
    ) : allPostsArray);
});

window.handleSwapClick = (id) => {
    if (!swapSourceKey) {
        swapSourceKey = id;
        document.querySelector(`.post-item[data-id="${id}"]`).style.border = '2px dashed #6c6cff';
        showToast("اضغط على المنشور التاني للتبديل");
    } else {
        if (swapSourceKey === id) {
            swapSourceKey = null;
            loadPosts(); 
            return;
        }
        const index1 = allPostsArray.findIndex(p => p.id === swapSourceKey);
        const index2 = allPostsArray.findIndex(p => p.id === id);

        if (index1 !== -1 && index2 !== -1) {
            const temp = allPostsArray[index1];
            allPostsArray[index1] = allPostsArray[index2];
            allPostsArray[index2] = temp;

            const updates = {};
            allPostsArray.forEach((post, i) => {
                updates[`posts/${post.id}/order`] = i;
            });

            update(ref(db), updates).then(() => {
                swapSourceKey = null;
                showToast("تم التبديل بنجاح", "success");
            });
        } else {
            swapSourceKey = null;
            loadPosts();
        }
    }
};

function loadPosts() {
    onValue(ref(db, 'posts'), (snapshot) => {
        allPosts = snapshot.val() || {};
        allPostsArray = Object.entries(allPosts)
            .map(([k, v]) => ({ id: k, ...v }))
            .sort((a, b) => {
                if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
                return (a.order || 0) - (b.order || 0);
            });

        document.getElementById('statTotal').textContent = allPostsArray.length;
        document.getElementById('statPinned').textContent = allPostsArray.filter(p => p.isPinned).length;

        const q = document.getElementById('searchInput').value.trim().toLowerCase();
        renderList(q ? allPostsArray.filter(p =>
            (p.title || '').toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
        ) : allPostsArray);
    });
}

function renderList(posts) {
    const list = document.getElementById('postsList');
    list.innerHTML = '';

    if (!posts.length) {
        list.innerHTML = `<div class="list-empty"><i class="fas fa-inbox" style="font-size:1.5rem; display:block; margin-bottom:12px; opacity:0.3;"></i>لا توجد منشورات</div>`;
        document.getElementById('bulkActions').classList.remove('active');
        return;
    }

    document.getElementById('bulkActions').classList.add('active');

    posts.forEach(post => {
        const dateStr = new Date(post.timestamp).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
        const div = document.createElement('div');
        div.className = `post-item ${editingPostId === post.id ? 'editing' : ''} ${post.isHidden ? 'hidden-post' : ''}`;
        div.setAttribute('data-id', post.id);

        div.innerHTML = `
            <input type="checkbox" class="post-checkbox" value="${post.id}">
            <i class="fas fa-exchange-alt drag-handle" onclick="handleSwapClick('${post.id}')" style="cursor:pointer; margin-right:8px;" title="تبديل"></i>
            <div class="post-item-info">
                <div class="post-item-title">${post.title || '(بدون عنوان)'} ${post.isHidden ? '<span style="color:var(--danger); font-size:0.7rem;">(مخفي)</span>' : ''}</div>
                <div class="post-item-meta">
                    ${post.isPinned ? `<div class="pin-indicator"></div>` : ''}
                    <span class="post-item-date">${dateStr}</span>
                    ${post.audioUrl ? `<span style="color: var(--accent); font-size: 0.75rem; font-weight: 900; margin-right: 12px;"><i class="fas fa-play"></i> ${post.playCount || 0}</span>` : ''}
                </div>
            </div>
            <div class="post-item-actions">
                <button class="icon-btn icon-btn-ghost" onclick="toggleHide('${post.id}', ${post.isHidden})" title="${post.isHidden ? 'إظهار' : 'إخفاء'}">
                    <i class="fas ${post.isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <button class="icon-btn icon-btn-pin ${post.isPinned ? 'pinned' : ''}" onclick="togglePin('${post.id}', ${post.isPinned})" title="${post.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}">
                    <i class="fas fa-thumbtack"></i>
                </button>
                <button class="icon-btn icon-btn-ghost" onclick="editPost('${post.id}')" title="تعديل">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="icon-btn icon-btn-danger" onclick="confirmDelete('${post.id}')" title="حذف">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        list.appendChild(div);
    });
}

// --- دوال الإخفاء والتحديد ---
window.toggleHide = (id, currentStatus) => {
    update(ref(db, `posts/${id}`), { isHidden: !currentStatus });
    showToast(currentStatus ? "تم إظهار المنشور للزوار" : "تم إخفاء المنشور");
};

document.getElementById('selectAllCb').addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.post-checkbox').forEach(cb => cb.checked = isChecked);
});

document.getElementById('bulkDeleteBtn').onclick = () => {
    const selected = Array.from(document.querySelectorAll('.post-checkbox:checked')).map(cb => cb.value);
    if(selected.length === 0) return showToast("حدد منشورات أولاً!", "error");
    if(confirm(`هل أنت متأكد من حذف ${selected.length} منشورات نهائياً؟`)) {
        selected.forEach(id => remove(ref(db, `posts/${id}`)));
        showToast("تم الحذف بنجاح");
        document.getElementById('selectAllCb').checked = false;
    }
};

document.getElementById('bulkHideBtn').onclick = () => {
    const selected = Array.from(document.querySelectorAll('.post-checkbox:checked')).map(cb => cb.value);
    if(selected.length === 0) return showToast("حدد منشورات أولاً!", "error");
    selected.forEach(id => {
        const post = allPostsArray.find(p => p.id === id);
        if(post) update(ref(db, `posts/${id}`), { isHidden: !post.isHidden });
    });
    showToast("تم تغيير حالة الإخفاء");
    document.getElementById('selectAllCb').checked = false;
};


// --- دوال الصدى والتسجيل ---
function generateReverb(ctx) {
    const length = ctx.sampleRate * 3.5; 
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 1.5); 
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
    }
    return impulse;
}

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioEl = document.getElementById('audioPreview');
        mediaElementSource = audioCtx.createMediaElementSource(audioEl);
        
        dryGainNode = audioCtx.createGain();
        wetGainNode = audioCtx.createGain();
        wetGainNode.gain.value = 0;

        convolverNode = audioCtx.createConvolver();
        convolverNode.buffer = generateReverb(audioCtx);
        
        const lowCut = audioCtx.createBiquadFilter();
        lowCut.type = "highpass";
        lowCut.frequency.value = 400; 
        
        const highCut = audioCtx.createBiquadFilter();
        highCut.type = "lowpass";
        highCut.frequency.value = 4000; 

        const preDelay = audioCtx.createDelay();
        preDelay.delayTime.value = 0.15; 

        mediaElementSource.connect(dryGainNode);
        dryGainNode.connect(audioCtx.destination);

        mediaElementSource.connect(preDelay);
        preDelay.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(convolverNode);
        convolverNode.connect(wetGainNode);
        wetGainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

document.getElementById('reverbSlider').addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('reverbValueTxt').innerText = val + '%';
    if(wetGainNode) wetGainNode.gain.value = val / 100;
});

document.getElementById('postAudioFile').addEventListener('change', function() {
    if (this.files.length > 0) {
        initAudioContext();
        const fileURL = URL.createObjectURL(this.files[0]);
        const preview = document.getElementById('audioPreview');
        preview.src = fileURL;
        preview.style.display = 'block';
        
        document.getElementById('reverbControl').style.display = 'block';
        document.getElementById('reverbSlider').value = 0;
        document.getElementById('reverbValueTxt').innerText = '0%';
        if(wetGainNode) wetGainNode.gain.value = 0;
    }
});

document.getElementById('startRecordBtn').onclick = async () => {
    try {
        initAudioContext(); 
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } 
        });

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        audioChunks = [];

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            document.getElementById('audioPreview').src = URL.createObjectURL(recordedAudioBlob);
            document.getElementById('audioPreview').style.display = 'block';
            
            document.getElementById('reverbControl').style.display = 'block';
            document.getElementById('reverbSlider').value = 0;
            document.getElementById('reverbValueTxt').innerText = '0%';
            if(wetGainNode) wetGainNode.gain.value = 0;

            stream.getTracks().forEach(track => track.stop());
        };

        document.getElementById('startRecordBtn').style.display = 'none';
        document.getElementById('stopRecordBtn').style.display = 'inline-flex';
    } catch (err) {
        console.error(err);
        showToast("الرجاء السماح بالوصول للمايكروفون", "error");
    }
};

document.getElementById('stopRecordBtn').onclick = () => {
    if(mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('startRecordBtn').style.display = 'inline-flex';
        document.getElementById('stopRecordBtn').style.display = 'none';
    }
};

function bufferToWave(abuffer, len) {
    let numOfChan = abuffer.numberOfChannels,
    length = len * numOfChan * 2 + 44,
    buffer = new ArrayBuffer(length),
    view = new DataView(buffer),
    channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);

    for(i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));

    const int16View = new Int16Array(buffer, 44);
    let writePos = 0;
    while(offset < len) {
        for(i = 0; i < numOfChan; i++) {
            sample = channels[i][offset];
            sample = sample < -1 ? -1 : (sample > 1 ? 1 : sample);
            int16View[writePos++] = sample < 0 ? sample * 32768 : sample * 32767;
        }
        offset++;
    }
    return new Blob([buffer], {type: "audio/wav"});
}

async function applyReverbAndGetBlob(blob, reverbValue) {
    if (reverbValue == 0) return blob;
    const arrayBuffer = await blob.arrayBuffer();
    const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    
    const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels || 2, audioBuffer.length + (audioBuffer.sampleRate * 2.0), audioBuffer.sampleRate);
    
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    
    const dry = offlineCtx.createGain();
    const wet = offlineCtx.createGain();
    wet.gain.value = reverbValue / 100;

    const conv = offlineCtx.createConvolver();
    conv.buffer = generateReverb(offlineCtx);

    const lowCut = offlineCtx.createBiquadFilter();
    lowCut.type = "highpass"; lowCut.frequency.value = 400;

    const highCut = offlineCtx.createBiquadFilter();
    highCut.type = "lowpass"; highCut.frequency.value = 4000;

    const preDelay = offlineCtx.createDelay();
    preDelay.delayTime.value = 0.15;

    source.connect(dry); dry.connect(offlineCtx.destination);
    source.connect(preDelay); preDelay.connect(lowCut);
    lowCut.connect(highCut); highCut.connect(conv);
    conv.connect(wet); wet.connect(offlineCtx.destination);

    source.start();
    const renderedBuffer = await offlineCtx.startRendering();
    if(tempCtx.state !== 'closed') tempCtx.close();
    
    return bufferToWave(renderedBuffer, renderedBuffer.length);
}

document.getElementById('publishBtn').onclick = async () => {
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const fileInput = document.getElementById('postImageFile');
    const audioInput = document.getElementById('postAudioFile');
    let imageUrl = document.getElementById('postImageUrl').value; 
    let audioUrl = document.getElementById('postAudioUrl').value; 

    if (!content) return showToast("المحتوى مطلوب!", "error");

    const btn = document.getElementById('publishBtn');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> جاري الرفع والنشر...`;

    try {
        if (fileInput.files.length > 0) {
            const formData = new FormData();
            formData.append("image", fileInput.files[0]);
            const resImage = await fetch(`https://api.imgbb.com/1/upload?key=10566b9490b2193f1db5498c611ab801`, {
                method: "POST", body: formData
            });
            const dataImage = await resImage.json();
            if (dataImage.success) imageUrl = dataImage.data.url; 
        }

        let audioToUpload = audioInput.files.length > 0 ? audioInput.files[0] : recordedAudioBlob;
        const reverbVal = document.getElementById('reverbSlider').value;

        if (audioToUpload) {
            if (reverbVal > 0) {
                btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> جاري دمج الصدى...`;
                audioToUpload = await applyReverbAndGetBlob(audioToUpload, reverbVal);
            }
            
            btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> جاري رفع الصوت...`;
            const audioData = new FormData();
            audioData.append("file", audioToUpload);
            audioData.append("upload_preset", "malaboushi_preset"); 

            const resAudio = await fetch(`https://api.cloudinary.com/v1_1/dwqdzwgms/video/upload`, {
                method: "POST", body: audioData
            });
            const dataAudio = await resAudio.json();
            if (dataAudio.secure_url) audioUrl = dataAudio.secure_url;
        }

        if (editingPostId) {
            await update(ref(db, `posts/${editingPostId}`), { title, content, imageUrl: imageUrl || null, audioUrl: audioUrl || null });
            showToast("تم تحديث المنشور");
        } else {
            await push(ref(db, 'posts'), {
                title, content, imageUrl: imageUrl || null, audioUrl: audioUrl || null, timestamp: Date.now(), order: Date.now() * -1, isPinned: false
            });
            showToast("تم نشر المنشور ✓");
        }
        resetEditor();
    } catch (error) {
        console.error(error);
        showToast("صار خطأ بالرفع!", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-paper-plane"></i> نشر`;
    }
};

window.editPost = (id) => {
    editingPostId = id;
    const post = allPosts[id];
    document.getElementById('postTitle').value = post.title || '';
    document.getElementById('postImageUrl').value = post.imageUrl || '';
    document.getElementById('postImageFile').value = '';
    document.getElementById('postAudioUrl').value = post.audioUrl || '';
    document.getElementById('postAudioFile').value = '';
    document.getElementById('postContent').value = post.content;
    document.getElementById('postContent').dispatchEvent(new Event('input'));
    document.getElementById('publishBtn').innerHTML = `<i class="fas fa-floppy-disk"></i> حفظ التعديلات`;
    document.getElementById('cancelEditBtn').style.display = 'inline-flex';
    document.getElementById('editBanner').classList.add('visible');
    document.querySelector('.editor-pane').scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.post-item').forEach(el => {
        el.classList.toggle('editing', el.getAttribute('data-id') === id);
    });
};

document.getElementById('cancelEditBtn').onclick = () => resetEditor();

function resetEditor() {
    editingPostId = null;
    document.getElementById('postTitle').value = '';
    document.getElementById('postImageUrl').value = '';
    document.getElementById('postImageFile').value = '';
    document.getElementById('postAudioUrl').value = '';
    document.getElementById('postAudioFile').value = '';
    
    document.getElementById('audioPreview').style.display = 'none';
    document.getElementById('audioPreview').src = '';
    document.getElementById('reverbControl').style.display = 'none';
    document.getElementById('reverbSlider').value = 0;
    if(wetGainNode) wetGainNode.gain.value = 0;
    recordedAudioBlob = null;

    document.getElementById('postContent').value = '';
    document.getElementById('charCounter').textContent = '0 حرف';
    document.getElementById('publishBtn').innerHTML = `<i class="fas fa-paper-plane"></i> نشر`;
    document.getElementById('publishBtn').disabled = false;
    document.getElementById('cancelEditBtn').style.display = 'none';
    document.getElementById('editBanner').classList.remove('visible');
    document.querySelectorAll('.post-item').forEach(el => el.classList.remove('editing'));
}

window.togglePin = (id, current) => {
    update(ref(db, `posts/${id}`), { isPinned: !current });
    showToast(current ? "تم إلغاء التثبيت" : "تم تثبيت المنشور");
};

window.confirmDelete = (id) => {
    postToDelete = id;
    document.getElementById('deleteModal').classList.add('open');
};

window.closeModal = () => {
    document.getElementById('deleteModal').classList.remove('open');
    postToDelete = null;
};

document.getElementById('deleteModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('deleteModal')) closeModal();
});

document.getElementById('confirmDelBtn').onclick = () => {
    if (!postToDelete) return;
    remove(ref(db, `posts/${postToDelete}`)).then(() => {
        showToast("تم حذف المنشور");
        closeModal();
        if (editingPostId === postToDelete) resetEditor();
    });
};

// ==========================================
// مكسر استوديو البث المباشر (Agora + Web Audio API)
// ==========================================
const AGORA_APP_ID = "7ca23eb56dfd45f7a89e9fd2a03a40ca"; 
let rtcClient = null;
let localCustomTrack = null;

let isLive = false;
let liveTimerInterval;
let seconds = 0;

// متغيرات المكسر المباشر للمدير
let liveAudioCtx;
let liveMicStream;
let liveSourceNode;
let liveNoiseFilter;
let liveReverbNode;
let liveWetGain;
let liveDryGain;
let liveMasterGain;
let liveMonitorGain;
let liveDest;

// متغيرات المكسر للضيف
let guestMediaStream;
let guestSourceNode;
let guestNoiseFilter;
let guestReverbNode;
let guestWetGain;
let guestDryGain;
let guestMasterGain;

const studioModal = document.getElementById('liveStudioModal');

if(document.getElementById('openStudioBtn')) {
    document.getElementById('openStudioBtn').onclick = () => {
        studioModal.style.display = 'flex';
        document.body.classList.add('studio-open');
        history.pushState(null, null, location.href); 
    };
}

if(document.getElementById('closeStudioBtn')) {
    document.getElementById('closeStudioBtn').onclick = () => {
        if(isLive) {
            showToast("يرجى إنهاء البث أولاً للتأكد.", "error");
        } else {
            studioModal.style.display = 'none';
            document.body.classList.remove('studio-open');
        }
    };
}

window.onpopstate = function () {
    if (studioModal && studioModal.style.display === 'flex') {
        history.pushState(null, null, location.href);
        showToast("استخدم زر 'إغلاق' بدلاً من زر الرجوع.", "error");
    }
};

// دوال الرجوع الذكي والقوائم
window.openAdminMenu = () => {
    document.getElementById('adminMenuOverlay').classList.add('open');
    document.getElementById('adminSideMenu').classList.add('open');
    history.pushState({ level: 'menu' }, null, location.href);
};
window.closeAdminMenu = () => {
    document.getElementById('adminMenuOverlay').classList.remove('open');
    document.getElementById('adminSideMenu').classList.remove('open');
};

// دالة موحدة لفتح المكسرات وإضافة خطوة للرجوع
window.openMixerModal = (id) => {
    document.getElementById(id).style.display = 'flex';
    history.pushState({ level: 'modal', id: id }, null, location.href);
};

// تعديل فتح النوافذ القديمة لتستخدم الستات
window.openRequestsModal = () => openMixerModal('requestsModal');
window.openViewersList = () => openMixerModal('viewersModal');
window.openMediaSelector = () => openMixerModal('mediaSelectorModal');

window.closeStudioModalOnly = () => {
    document.getElementById('liveStudioModal').style.display = 'none';
    document.body.classList.remove('studio-open');
};

// إضافة حالة الاستوديو عند الفتح
document.getElementById('openStudioBtn').onclick = () => {
    document.getElementById('liveStudioModal').style.display = 'flex';
    document.body.classList.add('studio-open');
    history.pushState({ level: 'studio' }, null, location.href); 
};

window.onpopstate = function (e) {
    const studio = document.getElementById('liveStudioModal');
    if (studio && studio.style.display === 'flex') {
        
        // 1. إذا في نافذة إعدادات مفتوحة، سكرها لحالها
        const openModals = document.querySelectorAll('.mixer-modal[style*="display: flex"]');
        if (openModals.length > 0) {
            openModals.forEach(m => m.style.display = 'none');
            return; // رجعنا خطوة
        }
        
        // 2. إذا القائمة الجانبية مفتوحة، سكرها لحالها
        if (document.getElementById('adminSideMenu').classList.contains('open')) {
            closeAdminMenu();
            return; // رجعنا خطوة
        }
        
        // 3. إذا مافي شي مفتوح، احبس المستخدم جوا البث! (لا تسمح بالرجوع)
        history.pushState({ level: 'studio' }, null, location.href);
        showToast("زر الرجوع معطل. اضغط 'إنهاء البث' أو 'مغادرة' من القائمة.", "warning");
    }
};

// استعادة البث بعد تحديث الصفحة (Refresh)
window.addEventListener('beforeunload', () => {
    if(isLive) sessionStorage.setItem('autoRejoinAdminLive', 'true');
});

// زر إغلاق الموسيقى برمجياً
function updateMediaMenuButton(isPlaying) {
    document.getElementById('menuStopMedia').style.display = isPlaying ? 'flex' : 'none';
}

// بدء البث وتجهيز المكسرات
if(document.getElementById('startLiveBtn')) {
    document.getElementById('startLiveBtn').onclick = async () => {
        try {
            document.getElementById('startLiveBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاتصال...';
            
            // مسح الدردشة مع كل بث جديد
            remove(ref(db, 'liveData/chat'));
            
            rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
            await rtcClient.join(AGORA_APP_ID, "abu_fayez_radio", null, "admin_uid");
            
            // 1. تشغيل المكسر وسحب المايك بأقل تأخير ممكن (Interactive) مع دقة ستيريو
            liveAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            liveMicStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
                    channelCount: 2, sampleRate: 48000
                } 
            });
            liveSourceNode = liveAudioCtx.createMediaStreamSource(liveMicStream);

            // 2. بوابة الضجيج الحقيقية (نظام التقاط الذروة للمسافات)
            let adminAnalyser = liveAudioCtx.createAnalyser();
            adminAnalyser.fftSize = 256;
            liveSourceNode.connect(adminAnalyser);

            liveNoiseFilter = liveAudioCtx.createGain(); 
            
            let checkAdminGate = () => {
                if(!isLive) return;
                requestAnimationFrame(checkAdminGate);

                const data = new Uint8Array(adminAnalyser.frequencyBinCount);
                adminAnalyser.getByteFrequencyData(data);

                let maxVol = 0; 
                for(let i=0; i<data.length; i++) {
                    if(data[i] > maxVol) maxVol = data[i];
                }
                
                let threshold = (parseInt(document.getElementById('noiseSlider').value) / 100) * 200;

                if (maxVol >= threshold) {
                    liveNoiseFilter.gain.setTargetAtTime(1, liveAudioCtx.currentTime, 0.01);
                } else {
                    liveNoiseFilter.gain.setTargetAtTime(0, liveAudioCtx.currentTime, 0.15);
                }
            };
            checkAdminGate();

            liveReverbNode = liveAudioCtx.createConvolver();
            liveReverbNode.buffer = generateReverb(liveAudioCtx);

            liveWetGain = liveAudioCtx.createGain();
            liveWetGain.gain.value = (document.getElementById('myRevSlider').value / 100) * 3; // قوة صدى مضروبة بـ 3

            liveDryGain = liveAudioCtx.createGain();
            liveDryGain.gain.value = 1;

            liveMasterGain = liveAudioCtx.createGain();
            liveMasterGain.gain.value = document.getElementById('myVolSlider').value / 100;

            liveMonitorGain = liveAudioCtx.createGain();
            liveMonitorGain.gain.value = document.getElementById('monitorSlider').value / 100;

            liveDest = liveAudioCtx.createMediaStreamDestination();

            // 3. ربط الأسلاك لتمر عبر البوابة الذكية
            liveSourceNode.connect(liveNoiseFilter);
            liveNoiseFilter.connect(liveDryGain);
            liveNoiseFilter.connect(liveReverbNode);
            liveReverbNode.connect(liveWetGain);
            
            liveDryGain.connect(liveMasterGain);
            liveWetGain.connect(liveMasterGain);
            
            liveMasterGain.connect(liveDest);
            liveMasterGain.connect(liveMonitorGain);
            liveMonitorGain.connect(liveAudioCtx.destination);

            // 4. مكسر الأغاني (Media Gain) للتحكم بحجم الملفات الصوتية عند الزوار
            if (typeof window.liveMediaGain === 'undefined') {
                window.liveMediaGain = liveAudioCtx.createGain();
            }
            window.liveMediaGain.gain.value = parseInt(document.getElementById('mediaVolSlider').value || 50) / 100;
            
            window.liveMediaGain.connect(liveDest); // سلك للزوار
            window.liveMediaGain.connect(liveMonitorGain); // سلك لسماعتك
            
            const localPlayer = document.getElementById('localAudioPlayer');
            if (!localPlayer.sourceNodeCreated) {
                try {
                    const localAudioSource = liveAudioCtx.createMediaElementSource(localPlayer);
                    localAudioSource.connect(window.liveMediaGain);
                    localPlayer.sourceNodeCreated = true;
                } catch(err) {}
            }

            // 4. تسليم الصوت لـ Agora
            localCustomTrack = AgoraRTC.createCustomAudioTrack({
                mediaStreamTrack: liveDest.stream.getAudioTracks()[0],
                encoderConfig: "high_quality_stereo"
            });
            
            await rtcClient.publish([localCustomTrack]);

            isLive = true;
            document.getElementById('startLiveBtn').style.display = 'none';
            document.getElementById('stopLiveBtn').style.display = 'inline-flex';
            document.getElementById('liveIndicator').style.display = 'block';
            
            set(ref(db, 'liveData'), {
                status: { isLive: true, startedAt: Date.now() }
            });

            startTimer();

            // 5. استقبال الضيف ودمجه بالمكسر الثاني
            rtcClient.on("user-published", async (user, mediaType) => {
                await rtcClient.subscribe(user, mediaType);
                if (mediaType === "audio") {
                    guestMediaStream = new MediaStream([user.audioTrack.getMediaStreamTrack()]);
                    guestSourceNode = liveAudioCtx.createMediaStreamSource(guestMediaStream);
                    
                    let guestAnalyser = liveAudioCtx.createAnalyser();
                    guestAnalyser.fftSize = 256;
                    guestSourceNode.connect(guestAnalyser);

                    guestNoiseFilter = liveAudioCtx.createGain(); 
                    let checkGuestGate = () => {
                        requestAnimationFrame(checkGuestGate);
                        const data = new Uint8Array(guestAnalyser.frequencyBinCount);
                        guestAnalyser.getByteFrequencyData(data);
                        
                        let maxVol = 0;
                        for(let i=0; i<data.length; i++) {
                            if(data[i] > maxVol) maxVol = data[i];
                        }
                        
                        let threshold = (parseInt(document.getElementById('guestNoiseSlider').value) / 100) * 200;

                        if (maxVol >= threshold) {
                            guestNoiseFilter.gain.setTargetAtTime(1, liveAudioCtx.currentTime, 0.01);
                        } else {
                            guestNoiseFilter.gain.setTargetAtTime(0, liveAudioCtx.currentTime, 0.15);
                        }
                    };
                    checkGuestGate();

                    guestReverbNode = liveAudioCtx.createConvolver(); 
                    guestReverbNode.buffer = generateReverb(liveAudioCtx);

                    guestWetGain = liveAudioCtx.createGain(); 
                    guestWetGain.gain.value = (document.getElementById('guestRevSlider').value / 100) * 3;

                    guestDryGain = liveAudioCtx.createGain(); 
                    guestDryGain.gain.value = 1;

                    guestMasterGain = liveAudioCtx.createGain(); 
                    guestMasterGain.gain.value = document.getElementById('guestVolSlider').value / 100;

                    // الربط للضيف
                    guestSourceNode.connect(guestNoiseFilter);
                    guestNoiseFilter.connect(guestDryGain); 
                    guestNoiseFilter.connect(guestReverbNode); 
                    guestReverbNode.connect(guestWetGain);
                    
                    guestDryGain.connect(guestMasterGain); 
                    guestWetGain.connect(guestMasterGain);
                    
                    guestMasterGain.connect(liveAudioCtx.destination); 
                    guestMasterGain.connect(liveDest);

                    document.getElementById('guestVolSlider').oninput = e => { 
                        document.getElementById('guestVolVal').innerText=e.target.value+'%'; 
                        guestMasterGain.gain.value = e.target.value/100; 
                    };
                    document.getElementById('guestNoiseSlider').oninput = e => { 
                        document.getElementById('guestNoiseVal').innerText=e.target.value+'%'; 
                    };
                    document.getElementById('guestRevSlider').oninput = e => { 
                        document.getElementById('guestRevVal').innerText=e.target.value+'%'; 
                        guestWetGain.gain.value = (e.target.value/100) * 3; 
                    };
                    
                    const muteBtn = document.getElementById('muteGuestBtn');
                    if(muteBtn) {
                        let isMuted = false;
                        muteBtn.onclick = function() {
                            isMuted = !isMuted;
                            guestMasterGain.gain.value = isMuted ? 0 : document.getElementById('guestVolSlider').value/100;
                            this.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i> كتم' : '<i class="fas fa-microphone"></i> إلغاء الكتم';
                        };
                    }
                }
            });

        } catch (error) {
            console.error("خطأ بالبث:", error);
            showToast("خطأ بالاتصال: تأكد من كود Agora", "error");
            document.getElementById('startLiveBtn').innerHTML = '<i class="fas fa-play"></i> بدء البث';
        }
    };
}

function stopLive() {
    if(localCustomTrack) { localCustomTrack.close(); }
    if(rtcClient) { rtcClient.leave(); }
    if(liveAudioCtx && liveAudioCtx.state !== 'closed') { liveAudioCtx.close(); }
    if(liveMicStream) { liveMicStream.getTracks().forEach(t => t.stop()); }
    
    isLive = false;
    clearInterval(liveTimerInterval);
    seconds = 0;
    document.getElementById('liveTimer').innerText = '00:00';
    document.getElementById('startLiveBtn').style.display = 'inline-flex';
    document.getElementById('startLiveBtn').innerHTML = '<i class="fas fa-play"></i> بدء البث';
    document.getElementById('stopLiveBtn').style.display = 'none';
    document.getElementById('liveIndicator').style.display = 'none';
    
    set(ref(db, 'liveData/status'), { isLive: false });
}

if(document.getElementById('stopLiveBtn')) document.getElementById('stopLiveBtn').onclick = stopLive;

function startTimer() {
    liveTimerInterval = setInterval(() => {
        seconds++;
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        document.getElementById('liveTimer').innerText = `${m}:${s}`;
    }, 1000);
}

// ربط الـ Sliders للمدير
if(document.getElementById('myVolSlider')) {
    document.getElementById('myVolSlider').oninput = (e) => {
        const val = e.target.value;
        document.getElementById('myVolVal').innerText = val + '%';
        if(liveMasterGain) liveMasterGain.gain.value = val / 100;
    };
}

if(document.getElementById('mediaVolSlider')) {
    document.getElementById('mediaVolSlider').oninput = (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('mediaVolVal').innerText = val + '%';
        
        if (window.liveMediaGain) {
            window.liveMediaGain.gain.value = val / 100;
        }
        
        if(typeof ytPlayerAdmin !== 'undefined' && ytPlayerAdmin && ytPlayerAdmin.setVolume) {
            try { ytPlayerAdmin.setVolume(val); } catch(err){}
        }
        
        if(isLive) {
            update(ref(db, 'liveData/media'), { volume: val });
        }
    };
}

if(document.getElementById('noiseSlider')) {
    document.getElementById('noiseSlider').oninput = (e) => {
        document.getElementById('noiseVal').innerText = e.target.value + '%';
    };
}

if(document.getElementById('myRevSlider')) {
    document.getElementById('myRevSlider').oninput = (e) => {
        const val = e.target.value;
        document.getElementById('myRevVal').innerText = val + '%';
        if(liveWetGain) liveWetGain.gain.value = (val / 100) * 3;
    };
}

if(document.getElementById('monitorSlider')) {
    document.getElementById('monitorSlider').oninput = (e) => {
        const val = e.target.value;
        document.getElementById('monitorVal').innerText = val + '%';
        if(liveMonitorGain) liveMonitorGain.gain.value = val / 100;
    };
}

// ==========================================
// دوال الدردشة والطلبات (لوحة الأدمن)
// ==========================================
window.sendAdminChat = () => {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if(!msg) return;
    push(ref(db, 'liveData/chat'), {
        senderId: 'admin',
        name: 'المدير (أبو فايز)',
        text: msg,
        timestamp: Date.now()
    });
    input.value = '';
};

window.clearChat = () => {
    if(confirm("هل أنت متأكد من مسح الدردشة نهائياً للكل؟")) {
        remove(ref(db, 'liveData/chat'));
        showToast("تم مسح المحادثات");
    }
};

onValue(ref(db, 'liveData/chat'), (snap) => {
    const data = snap.val();
    const chatArea = document.getElementById('chatArea');
    if(!chatArea) return;
    chatArea.innerHTML = '';
    if(data) {
        Object.values(data).sort((a,b) => a.timestamp - b.timestamp).forEach(msg => {
            const isAdmin = msg.senderId === 'admin';
            chatArea.innerHTML += `
                <div class="chat-msg" style="background: ${isAdmin ? 'var(--accent-glow)' : 'var(--surface-2)'};">
                    <span class="name" style="color: ${isAdmin ? 'var(--accent)' : 'var(--ink)'};">${isAdmin ? '👑' : ''} ${msg.name}:</span>
                    <span>${msg.text}</span>
                </div>
            `;
        });
        chatArea.scrollTop = chatArea.scrollHeight;
    } else {
        chatArea.innerHTML = '<div style="text-align: center; color: var(--ink-faint); margin-top: 20px;">الدردشة فارغة. ابدأ البث للتواصل.</div>';
    }
});

// دوال قائمة المشاهدين
window.openViewersList = () => {
    document.getElementById('viewersModal').style.display = 'flex';
};

window.kickViewer = (uid) => {
    set(ref(db, `liveData/kicked/${uid}`), Date.now()); // لإعطاء أمر الطرد للزائر
    remove(ref(db, `liveData/viewers/${uid}`));
    remove(ref(db, `liveData/requests/${uid}`));
    showToast("تم طرد المشاهد بنجاح");
};

onValue(ref(db, 'liveData/viewers'), (snap) => {
    const data = snap.val();
    const countSpan = document.getElementById('viewersCount');
    const vList = document.getElementById('viewersModalList');
    
    if(countSpan) countSpan.innerText = data ? Object.keys(data).length : '0';
    
    if(vList) {
        vList.innerHTML = '';
        if(data) {
            Object.entries(data).forEach(([uid, v]) => {
                vList.innerHTML += `
                    <div class="request-item">
                        <span style="font-weight: bold; font-size: 0.9rem;"><i class="fas fa-headphones" style="color:var(--ink-muted); margin-left:5px;"></i> ${v.name}</span>
                        <button class="btn btn-danger-soft" style="padding: 4px 10px; font-size: 0.75rem;" onclick="kickViewer('${uid}')"><i class="fas fa-ban"></i> طرد</button>
                    </div>
                `;
            });
        } else {
            vList.innerHTML = '<div style="text-align:center; padding: 20px; color:var(--ink-faint);">لا يوجد مشاهدين حالياً</div>';
        }
    }
});

onValue(ref(db, 'liveData/requests'), (snap) => {
    const data = snap.val();
    const reqList = document.getElementById('requestsList');
    const reqBell = document.getElementById('reqBellIcon');
    const reqBadge = document.getElementById('reqBellBadge');
    if(!reqList) return;
    reqList.innerHTML = '';
    
    let hasApproved = false;
    let pendingCount = 0;

    if(data) {
        Object.entries(data).forEach(([uid, req]) => {
            if(req.status === 'pending') {
                pendingCount++;
                reqList.innerHTML += `
                    <div class="request-item">
                        <span style="font-size: 0.85rem; font-weight: 700;">${req.name}</span>
                        <div class="request-actions">
                            <button class="btn btn-primary" onclick="acceptGuest('${uid}', '${req.name}')" style="padding: 4px 8px; font-size: 0.7rem;">قبول</button>
                            <button class="btn btn-danger-soft" onclick="rejectGuest('${uid}')" style="padding: 4px 8px; font-size: 0.7rem;">رفض</button>
                        </div>
                    </div>
                `;
            } else if (req.status === 'approved') {
                hasApproved = true;
                reqList.innerHTML += `
                    <div class="request-item" style="border-right: 3px solid var(--success); background: var(--success-bg);">
                        <span style="font-size: 0.85rem; font-weight: 700; color: var(--success);"><i class="fas fa-headset"></i> ${req.name} (على الهواء)</span>
                        <div class="request-actions">
                            <button class="btn btn-danger-soft" onclick="removeGuest('${uid}')" style="padding: 4px 8px; font-size: 0.7rem;"><i class="fas fa-sign-out-alt"></i> إنزال</button>
                        </div>
                    </div>
                `;
                document.getElementById('coHostName').innerText = req.name;
                const dropBtn = document.getElementById('kickGuestBtn');
                if(dropBtn) dropBtn.onclick = () => removeGuest(uid);
            }
        });
    }

    // تحديث الجرس
    if(pendingCount > 0) {
        reqBell.classList.add('active');
        reqBadge.innerText = pendingCount;
    } else {
        reqBell.classList.remove('active');
    }

    if(pendingCount === 0 && !hasApproved) {
        reqList.innerHTML = '<div style="text-align: center; color: var(--ink-faint); font-size: 0.8rem; margin-top: 20px;">لا يوجد طلبات صعود حالياً.</div>';
    }

    if(!hasApproved) {
        document.getElementById('coHostName').innerText = "لا يوجد ضيف حالياً";
    }
});

window.acceptGuest = (uid, name) => {
    update(ref(db, `liveData/requests/${uid}`), { status: 'approved' });
    showToast("تم قبول " + name);
};

window.rejectGuest = (uid) => {
    update(ref(db, `liveData/requests/${uid}`), { status: 'rejected' });
};

window.removeGuest = (uid) => {
    remove(ref(db, `liveData/requests/${uid}`));
    showToast("تم إنزال الضيف");
};

// ==========================================
// دوال ميزة اليوتيوب والميديا المحلية
// ==========================================
window.openMediaSelector = () => {
    document.getElementById('mediaSelectorModal').style.display = 'flex';
};

const ytTag = document.createElement('script');
ytTag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(ytTag, firstScriptTag);

let ytPlayerAdmin;
let syncInterval;

window.onYouTubeIframeAPIReady = () => {
    ytPlayerAdmin = new YT.Player('ytAdminContainer', {
        height: '100%', width: '100%',
        playerVars: { 'controls': 1, 'disablekb': 1 },
        events: { 'onStateChange': onAdminPlayerStateChange }
    });
};

function onAdminPlayerStateChange(event) {
    if(!isLive) return;
    const state = event.data === YT.PlayerState.PLAYING ? 'playing' : (event.data === YT.PlayerState.PAUSED ? 'paused' : 'other');
    if(state === 'playing' || state === 'paused') {
        update(ref(db, 'liveData/media'), { state: state, time: ytPlayerAdmin.getCurrentTime(), ts: Date.now() });
    }
}

window.activeAdminMedia = null; // متغير ذكي ليعرف مين اللي شغال بالزبط

window.stopSharedMedia = () => {
    window.activeAdminMedia = null;
    document.getElementById('adminSharedPlayer').style.display = 'none';
    if(ytPlayerAdmin && ytPlayerAdmin.stopVideo) {
        try { ytPlayerAdmin.stopVideo(); } catch(err){}
    }
    const localPlayer = document.getElementById('localAudioPlayer');
    if(localPlayer) {
        localPlayer.pause();
        localPlayer.currentTime = 0;
        localPlayer.removeAttribute('src'); // مسح المسار بشكل كامل لتأكيد الإيقاف
        localPlayer.load();
    }
    clearInterval(syncInterval);
    remove(ref(db, 'liveData/media')); 
    updateMediaMenuButton(false);
    
    // تصفير الخانات عند الإيقاف متل ما طلبت
    document.getElementById('ytLinkInput').value = '';
    document.getElementById('localAudioInput').value = '';
};

window.toggleSharedMediaPlay = () => {
    const localPlayer = document.getElementById('localAudioPlayer');
    
    if (window.activeAdminMedia === 'youtube') {
        if (ytPlayerAdmin && ytPlayerAdmin.getPlayerState) {
            const state = ytPlayerAdmin.getPlayerState();
            if (state === 1) ytPlayerAdmin.pauseVideo(); // 1 = PLAYING
            else ytPlayerAdmin.playVideo();
        }
    } else if (window.activeAdminMedia === 'local') {
        if (localPlayer) {
            if (localPlayer.paused) localPlayer.play();
            else localPlayer.pause();
        }
    } else {
        showToast("مافي شي شغال لتوقفو يا عكيد!", "warning");
    }
};

window.startSharedMedia = (type, display) => {
    if(!isLive) return showToast("يجب بدء البث أولاً!", "error");
    document.getElementById('mediaSelectorModal').style.display = 'none';
    
    const rawUrl = document.getElementById('ytLinkInput').value;
    const match = rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=))([^"&?\/\s]{11})/);
    if(!match) return showToast("رابط يوتيوب غير صالح", "error");
    
    const url = match[1];
    document.getElementById('adminSharedPlayer').style.display = 'block';
    document.getElementById('localPlayerWrapper').style.display = 'block'; 
    
    if(display === 'audio') {
        document.getElementById('ytAdminContainer').style.display = 'none';
        document.getElementById('ytAudioPlaceholder').style.display = 'flex';
        document.getElementById('ytAudioPlaceholder').innerHTML = '<i class="fas fa-music fade-anim"></i>';
    } else {
        document.getElementById('ytAdminContainer').style.display = 'block';
        document.getElementById('ytAudioPlaceholder').style.display = 'none';
    }
    
    const localPlayer = document.getElementById('localAudioPlayer');
    if(localPlayer) { localPlayer.pause(); localPlayer.style.display = 'none'; }
    
    if(ytPlayerAdmin && ytPlayerAdmin.loadVideoById) {
        ytPlayerAdmin.loadVideoById(url);
    }
    window.activeAdminMedia = 'youtube'; // تحديد اليوتيوب كمشغل نشط

    const currentVol = parseInt(document.getElementById('mediaVolSlider').value || 50);
    if(ytPlayerAdmin && ytPlayerAdmin.setVolume) {
        try { ytPlayerAdmin.setVolume(currentVol); } catch(err){}
    }

    set(ref(db, 'liveData/media'), { type: 'youtube', url: url, display: display, state: 'playing', time: 0, volume: currentVol, ts: Date.now() });
    updateMediaMenuButton(true);            
    
    clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        if(ytPlayerAdmin && ytPlayerAdmin.getPlayerState && ytPlayerAdmin.getPlayerState() === YT.PlayerState.PLAYING) {
            const cur = ytPlayerAdmin.getCurrentTime();
            const tot = ytPlayerAdmin.getDuration();
            update(ref(db, 'liveData/media'), { time: cur, ts: Date.now() });
            
            if(tot) {
                document.getElementById('localAudioSeek').value = (cur / tot) * 100;
                document.getElementById('localTimeCurrent').innerText = Math.floor(cur/60).toString().padStart(2,'0') + ":" + Math.floor(cur%60).toString().padStart(2,'0');
                document.getElementById('localTimeTotal').innerText = Math.floor(tot/60).toString().padStart(2,'0') + ":" + Math.floor(tot%60).toString().padStart(2,'0');
            }
        }
    }, 1500);

    document.getElementById('localAudioSeek').oninput = (e) => {
        if(ytPlayerAdmin && ytPlayerAdmin.getDuration) {
            const newTime = (e.target.value / 100) * ytPlayerAdmin.getDuration();
            ytPlayerAdmin.seekTo(newTime, true);
            update(ref(db, 'liveData/media'), { time: newTime, ts: Date.now() });
        }
    };
};

document.getElementById('localAudioInput').onchange = async function(e) {
    const file = e.target.files[0];
    if(file) {
        document.getElementById('mediaSelectorModal').style.display = 'none';
        document.getElementById('adminSharedPlayer').style.display = 'block';
        document.getElementById('ytAdminContainer').style.display = 'none';
        document.getElementById('localPlayerWrapper').style.display = 'block';
        
        if(ytPlayerAdmin && ytPlayerAdmin.stopVideo) { try { ytPlayerAdmin.stopVideo(); } catch(err){} }
        clearInterval(syncInterval);
        remove(ref(db, 'liveData/media')); 
        updateMediaMenuButton(true);
        window.activeAdminMedia = 'local'; // تحديد الملف المحلي كمشغل نشط

        const fileUrl = URL.createObjectURL(file);
        const fileType = file.type.split('/')[0];
        const localPlayer = document.getElementById('localAudioPlayer');
        const placeholder = document.getElementById('ytAudioPlaceholder');

        if (fileType === 'image') {
            localPlayer.style.display = 'none';
            placeholder.style.display = 'flex';
            placeholder.innerHTML = `<img src="${fileUrl}" style="max-width:100%; max-height:200px; border-radius:10px; object-fit:contain;">`;
        } else if (fileType === 'video') {
            placeholder.style.display = 'none';
            localPlayer.style.display = 'block';
            localPlayer.src = fileUrl;
            localPlayer.play();
        } else { 
            placeholder.style.display = 'flex';
            placeholder.innerHTML = '<i class="fas fa-file-audio fade-anim"></i>';
            localPlayer.style.display = 'none';
            localPlayer.src = fileUrl;
            localPlayer.play();
        }
        
        if(!isLive) {
            showToast("لتسمع الأغنية مع الزوار، ابدأ البث أولاً!", "error");
        } else if (fileType === 'image' || fileType === 'video') {
            // الرفع التلقائي ليتمكن الزوار من المشاهدة
            showToast("جاري الرفع السريع ليراه الزوار...", "warning");
            try {
                let uploadedUrl = '';
                if (fileType === 'image') {
                    const formData = new FormData(); formData.append("image", file);
                    const res = await fetch(`https://api.imgbb.com/1/upload?key=10566b9490b2193f1db5498c611ab801`, { method: "POST", body: formData });
                    const data = await res.json();
                    if(data.success) uploadedUrl = data.data.url;
                } else {
                    const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", "malaboushi_preset"); 
                    const res = await fetch(`https://api.cloudinary.com/v1_1/dwqdzwgms/video/upload`, { method: "POST", body: formData });
                    const data = await res.json();
                    if(data.secure_url) uploadedUrl = data.secure_url;
                }
                
                if(uploadedUrl) {
                    showToast("تمت المشاركة مع الزوار بنجاح!");
                    set(ref(db, 'liveData/media'), { type: 'local', url: uploadedUrl, display: fileType, state: 'playing', time: 0, ts: Date.now() });
                }
            } catch(err) {
                showToast("فشل رفع الملف للزوار", "error");
            }
        }

        clearInterval(syncInterval);
        if(fileType === 'video' || fileType === 'audio') {
            syncInterval = setInterval(() => {
                if(!localPlayer.paused && isLive && fileType === 'video') {
                    update(ref(db, 'liveData/media'), { time: localPlayer.currentTime, ts: Date.now(), state: 'playing' });
                }
            }, 1500);
        }

        document.getElementById('localAudioSeek').oninput = (ev) => {
            if(!localPlayer.duration) return;
            const newTime = (ev.target.value / 100) * localPlayer.duration;
            localPlayer.currentTime = newTime;
            if(fileType === 'video' && isLive) update(ref(db, 'liveData/media'), { time: newTime, ts: Date.now() });
        };
        
        localPlayer.ontimeupdate = () => {
            if(!localPlayer.duration) return;
            const cur = localPlayer.currentTime;
            const tot = localPlayer.duration;
            document.getElementById('localAudioSeek').value = (cur / tot) * 100;
            document.getElementById('localTimeCurrent').innerText = Math.floor(cur/60).toString().padStart(2,'0') + ":" + Math.floor(cur%60).toString().padStart(2,'0');
            document.getElementById('localTimeTotal').innerText = Math.floor(tot/60).toString().padStart(2,'0') + ":" + Math.floor(tot%60).toString().padStart(2,'0');
        };
        
        localPlayer.onpause = () => { if(fileType === 'video' && isLive) update(ref(db, 'liveData/media'), { state: 'paused' }); };
        localPlayer.onplay = () => { if(fileType === 'video' && isLive) update(ref(db, 'liveData/media'), { state: 'playing', time: localPlayer.currentTime, ts: Date.now() }); };
    }
};
