"use strict";

import { chatTextDateFormat } from "./utils/formatDate.js";

// 전역 변수
const socket = io();
const peerConnections = {};
let localStream = null;
let currentRoom = null;
let nickname = '';
let isMicOn = true;
let isCameraOn = true;
let unreadMessages = 0;
let isMobile = window.innerWidth <= 768;

const configuration = {
    iceServers: [
        {
            urls: 'stun:stun.l.google.com:19302'
        },
        {
            urls: 'stun:stun1.l.google.com:19302'
        }
    ]
};

// DOM 요소
const lobby = document.getElementById('lobby');
const mainContent = document.getElementById('mainContent');
const nicknameInput = document.getElementById('nicknameInput');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const micBtn = document.getElementById('micBtn');
const cameraBtn = document.getElementById('cameraBtn');
const chatBtn = document.getElementById('chatBtn');
const videosGrid = document.getElementById('videosGrid');
const roomName = document.getElementById('roomName');
const participantCount = document.getElementById('participantCount');

// 채팅 요소 (데스크톱)
const chatSection = document.getElementById('chatSection');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// 채팅 요소 (모바일)
const chatModal = document.getElementById('chatModal');
const chatMessagesModal = document.getElementById('chatMessagesModal');
const chatInputModal = document.getElementById('chatInputModal');
const sendBtnModal = document.getElementById('sendBtnModal');
const closeModal = document.getElementById('closeModal');
const chatBadge = document.getElementById('chatBadge');

// 화면 크기 감지
window.addEventListener('resize', () => isMobile = window.innerWidth <= 768);

// 로컬 비디오 시작
async function startLocalVideo() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 1280,
                height: 720
            },
            audio: true
        });

        addVideoElement('local', localStream, nickname + ' (나)');
        roomName.textContent = currentRoom;
    } catch (err) {
        console.error('카메라 접근 오류:', err);
        alert('카메라와 마이크 권한이 필요합니다.');
    }
}

// 비디오 요소 추가
function addVideoElement(id, stream, label) {
    let wrapper = document.getElementById(`wrapper-${id}`);
    
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.id = `wrapper-${id}`;
        
        const video = document.createElement('video');
        video.id = `video-${id}`;
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        if (id === 'local') video.muted = true;
        
        const labelEl = document.createElement('div');
        labelEl.className = 'video-label';
        labelEl.textContent = label;
        
        const offOverlay = document.createElement('div');
        offOverlay.className = 'video-off-overlay';
        offOverlay.id = `overlay-${id}`;
        offOverlay.innerHTML = `
            <div class="avatar">${label.charAt(0).toUpperCase()}</div>
            <div>${label}</div>
        `;
        
        wrapper.appendChild(video);
        wrapper.appendChild(labelEl);
        wrapper.appendChild(offOverlay);
        videosGrid.appendChild(wrapper);
    }
}

// Peer Connection 생성
function createPeerConnection(userId, userName) {
    const pc = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
        addVideoElement(userId, event.streams[0], userName);
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: userId,
                candidate: event.candidate
            });
        }
    };

    return pc;
}

// 입장
joinBtn.addEventListener('click', async () => {
    const nick = nicknameInput.value.trim();
    const room = roomInput.value.trim();
    
    if (!nick || !room) {
        alert('닉네임과 방 이름을 모두 입력하세요');
        return;
    }

    nickname = nick;
    currentRoom = room;
    
    await startLocalVideo();
    socket.emit('join-room', { roomId: room, nickname: nick });
    
    lobby.style.display = 'none';
    mainContent.classList.add('active');

    // 모바일이면 채팅 버튼 표시
    if (isMobile) chatBtn.style.display = 'flex';
});

// 나가기
leaveBtn.addEventListener('click', () => location.reload());

// 마이크 토글
micBtn.addEventListener('click', () => {
    isMicOn = !isMicOn;
    localStream.getAudioTracks()[0].enabled = isMicOn;
    micBtn.classList.toggle('active');
    micBtn.innerHTML = isMicOn ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
            class="lucide lucide-mic-icon lucide-mic">
            <path d="M12 19v3"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <rect x="9" y="2" width="6" height="13" rx="3"/>
        </svg>
    ` : `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
            class="lucide lucide-mic-off-icon lucide-mic-off">
            <path d="M12 19v3"/>
            <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
            <path d="M16.95 16.95A7 7 0 0 1 5 12v-2"/>
            <path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/>
            <path d="m2 2 20 20"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
        </svg>
    `;
});

// 카메라 토글
cameraBtn.addEventListener('click', () => {
    isCameraOn = !isCameraOn;
    localStream.getVideoTracks()[0].enabled = isCameraOn;
    cameraBtn.classList.toggle('active');
    cameraBtn.innerHTML = isCameraOn ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
            class="lucide lucide-video-icon lucide-video">
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
            <rect x="2" y="6" width="14" height="12" rx="2"/>
        </svg>    
    ` : `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
            class="lucide lucide-video-off-icon lucide-video-off">
            <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"/>
            <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/>
            <path d="m2 2 20 20"/>
        </svg>
    `;
    
    const overlay = document.getElementById('overlay-local');
    if (overlay) {
        overlay.classList.toggle('active', !isCameraOn);
    }
});

// 채팅 버튼 (모바일)
chatBtn.addEventListener('click', () => {
    if (isMobile) {
        chatModal.classList.add('active');
        unreadMessages = 0;
        chatBadge.classList.remove('active');
        chatBadge.textContent = '0';
    }
});

// 모달 닫기
closeModal.addEventListener('click', () => {
    chatModal.classList.remove('active');
});

// 모달 배경 클릭시 닫기
chatModal.addEventListener('click', (e) => {
    if (e.target === chatModal) {
        chatModal.classList.remove('active');
    }
});

// 채팅 전송 (데스크톱)
function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    socket.emit('chat-message', { message, nickname });
    addChatMessage(nickname, message, true);
    chatInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// 채팅 전송 (모바일)
function sendMessageModal() {
    const message = chatInputModal.value.trim();
    if (!message) return;
    
    socket.emit('chat-message', { message, nickname });
    addChatMessage(nickname, message, true);
    chatInputModal.value = '';
}

sendBtnModal.addEventListener('click', sendMessageModal);
chatInputModal.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessageModal();
});

// 채팅 메시지 추가
function addChatMessage(sender, message, isOwn = false) {
    const msgEl = document.createElement('div');
    msgEl.className = `message ${isOwn ? 'own' : 'other'}`;
    msgEl.innerHTML = `
        <div class="sender">${isOwn ? "나" : sender} (${chatTextDateFormat(new Date())})</div>
        <div>${message}</div>
    `;
    
    // 데스크톱 채팅에 추가
    chatMessages.appendChild(msgEl.cloneNode(true));
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 모바일 채팅에 추가
    chatMessagesModal.appendChild(msgEl.cloneNode(true));
    chatMessagesModal.scrollTop = chatMessagesModal.scrollHeight;

    // 모바일에서 모달이 닫혀있고 본인 메시지가 아니면 뱃지 표시
    if (isMobile && !chatModal.classList.contains('active') && !isOwn) {
        unreadMessages++;
        chatBadge.textContent = unreadMessages;
        chatBadge.classList.add('active');
    }
}

// Socket 이벤트
socket.on('existing-users', async (users) => {
    participantCount.textContent = users.length + 1;
    
    for (let user of users) {
        const pc = createPeerConnection(user.id, user.nickname);
        peerConnections[user.id] = pc;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { target: user.id, offer });
    }
});

socket.on('user-connected', (data) => {
    participantCount.textContent = parseInt(participantCount.textContent) + 1;
    addChatMessage('시스템', `${data.nickname}님이 입장했습니다.`);
});

socket.on('offer', async (data) => {
    const pc = createPeerConnection(data.from, data.nickname);
    peerConnections[data.from] = pc;

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', { target: data.from, answer });
});

socket.on('answer', async (data) => {
    await peerConnections[data.from].setRemoteDescription(
        new RTCSessionDescription(data.answer)
    );
});

socket.on('ice-candidate', async (data) => {
    if (peerConnections[data.from]) {
        await peerConnections[data.from].addIceCandidate(
            new RTCIceCandidate(data.candidate)
        );
    }
});

socket.on('user-disconnected', (data) => {
    participantCount.textContent = parseInt(participantCount.textContent) - 1;
    
    if (peerConnections[data.userId]) {
        peerConnections[data.userId].close();
        delete peerConnections[data.userId];
    }

    const wrapper = document.getElementById(`wrapper-${data.userId}`);
    if (wrapper) {
        wrapper.style.transition = 'opacity 0.3s';
        wrapper.style.opacity = '0';
        setTimeout(() => wrapper.remove(), 300);
    }
    
    addChatMessage('시스템', `${data.nickname}님이 퇴장했습니다.`);
});

socket.on('chat-message', (data) => {
    addChatMessage(data.nickname, data.message);
});