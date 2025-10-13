"use strict";

import { chatTextDateFormat } from "./utils/formatDate.js";

// 전역 변수
const socket = io();
const peerConnections = {};
let localStream = null;
let screenStream = null;
let currentRoom = null;
let currentRoomTitle = '';
let currentRoomCode = '';
let nickname = '';
let isMicOn = true;
let isCameraOn = true;
let isScreenSharing = false;
let unreadMessages = 0;
let isMobile = window.innerWidth <= 768;

// UUID 생성 함수
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// 짧은 코드 생성 함수 (6자리)
function generateShortCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // 시간값 일부 추가 → 충돌 확률 극소화
    return code + '-' + Date.now().toString(36).slice(-5);
}

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// DOM 요소
const lobby = document.getElementById('lobby');
const mainContent = document.getElementById('mainContent');
const nicknameInput = document.getElementById('nicknameInput');
const roomTitleInput = document.getElementById('roomTitleInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinBtn = document.getElementById('joinBtn');
const roomInfo = document.getElementById('roomInfo');
const displayRoomTitle = document.getElementById('displayRoomTitle');
const displayRoomCode = document.getElementById('displayRoomCode');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const leaveBtn = document.getElementById('leaveBtn');
const micBtn = document.getElementById('micBtn');
const cameraBtn = document.getElementById('cameraBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
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

// URL에서 방 코드 확인 (페이지 로드 시)
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code && roomCodeInput) {
        roomCodeInput.value = code;
    }
});

// 방 코드 복사
if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
        const code = displayRoomCode.textContent;
        
        // URL 생성
        const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
        
        navigator.clipboard.writeText(url).then(() => {
            const originalText = copyCodeBtn.textContent;
            copyCodeBtn.textContent = '복사됨!';
            copyCodeBtn.style.background = '#27ae60';
            
            setTimeout(() => {
                copyCodeBtn.textContent = originalText;
                copyCodeBtn.style.background = '#667eea';
            }, 2000);
        }).catch(err => {
            alert('복사 실패: ' + err);
        });
    });
}

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

        addVideoElement('local', localStream, nickname + ' (나)', false);
        roomName.textContent = currentRoomTitle || currentRoomCode;
    } catch (err) {
        console.error('카메라 접근 오류:', err);
        alert('카메라와 마이크 권한이 필요합니다.');
    }
}

// 비디오 요소 추가
function addVideoElement(id, stream, label, isScreen = false) {
    let wrapper = document.getElementById(`wrapper-${id}`);
    
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        if (isScreen) {
            wrapper.classList.add('screen-share');
        }
        wrapper.id = `wrapper-${id}`;
        
        const video = document.createElement('video');
        video.id = `video-${id}`;
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        if (id === 'local' || id === 'local-screen') video.muted = true;
        
        const labelEl = document.createElement('div');
        labelEl.className = 'video-label';
        if (isScreen) {
            labelEl.classList.add('screen-share');
        }
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

// 화면 공유 비디오 요소 제거
function removeVideoElement(id) {
    const wrapper = document.getElementById(`wrapper-${id}`);
    if (wrapper) {
        wrapper.style.transition = 'opacity 0.3s';
        wrapper.style.opacity = '0';
        setTimeout(() => wrapper.remove(), 300);
    }
}

// Peer Connection 생성
function createPeerConnection(userId, userName) {
    const pc = new RTCPeerConnection(configuration);

    // 화면 공유 중이면 화면 공유 스트림 전송, 아니면 로컬 스트림 전송
    const streamToSend = isScreenSharing ? screenStream : localStream;
    streamToSend.getTracks().forEach(track => pc.addTrack(track, streamToSend));

    pc.ontrack = (event) => {
        const stream = event.streams[0];
        const videoTrack = stream.getVideoTracks()[0];
        
        // 화면 공유인지 확인 (contentHint로 구분)
        const isScreenTrack = videoTrack && videoTrack.contentHint === 'detail';
        
        if (isScreenTrack) {
            addVideoElement(`${userId}-screen`, stream, `${userName}의 화면`, true);
        } else {
            addVideoElement(userId, stream, userName, false);
        }
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

// 화면 공유 시작
async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor'
            },
            audio: false
        });

        // 화면 공유 트랙에 contentHint 설정
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.contentHint = 'detail';
        }

        // 화면 공유 비디오 추가
        addVideoElement('local-screen', screenStream, nickname + '의 화면 (나)', true);

        // 모든 피어에게 화면 공유 스트림 전송
        for (let userId in peerConnections) {
            const pc = peerConnections[userId];
            const senders = pc.getSenders();
            
            // 기존 비디오 트랙을 화면 공유 트랙으로 교체
            const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
            if (videoSender) {
                videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
            }
        }

        // 화면 공유가 중지되었을 때 처리
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        isScreenSharing = true;
        screenShareBtn.classList.add('screen-sharing');
        
        // 아이콘 변경
        screenShareBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
                class="lucide lucide-monitor-x">
                <path d="m14.5 12.5-5-5"/>
                <path d="m9.5 12.5 5-5"/>
                <rect width="20" height="14" x="2" y="3" rx="2"/>
                <path d="M12 17v4"/>
                <path d="M8 21h8"/>
            </svg>
        `;

        // 다른 사용자들에게 화면 공유 시작 알림
        socket.emit('screen-share-started', { nickname });

    } catch (err) {
        console.error('화면 공유 오류:', err);
        if (err.name === 'NotAllowedError') {
            alert('화면 공유 권한이 거부되었습니다.');
        } else {
            alert('화면 공유를 시작할 수 없습니다.');
        }
    }
}

// 화면 공유 중지
async function stopScreenShare() {
    if (!screenStream) return;

    // 화면 공유 스트림 정지
    screenStream.getTracks().forEach(track => track.stop());
    
    // 화면 공유 비디오 요소 제거
    removeVideoElement('local-screen');

    // 모든 피어에게 원래 비디오 트랙으로 복원
    for (let userId in peerConnections) {
        const pc = peerConnections[userId];
        const senders = pc.getSenders();
        
        const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
        if (videoSender && localStream) {
            videoSender.replaceTrack(localStream.getVideoTracks()[0]);
        }
    }

    screenStream = null;
    isScreenSharing = false;
    screenShareBtn.classList.remove('screen-sharing');
    
    // 아이콘 원래대로
    screenShareBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" 
            class="lucide lucide-monitor-up">
            <path d="m9 10 3-3 3 3"/>
            <path d="M12 13V7"/>
            <rect width="20" height="14" x="2" y="3" rx="2"/>
            <path d="M12 17v4"/>
            <path d="M8 21h8"/>
        </svg>
    `;

    // 다른 사용자들에게 화면 공유 중지 알림
    socket.emit('screen-share-stopped', { nickname });
}

// 입장
joinBtn.addEventListener('click', async () => {
    const nick = nicknameInput.value.trim();
    const title = roomTitleInput.value.trim();
    let code = roomCodeInput.value.trim();
    
    if (!nick) {
        alert('닉네임을 입력하세요');
        return;
    }

    if (!title && !code) {
        alert('방 제목을 입력하거나 방 코드를 입력하세요');
        return;
    }

    // 코드가 없으면 자동 생성
    if (!code) {
        code = generateShortCode();
    }

    nickname = nick;
    currentRoomTitle = title;
    currentRoomCode = code;
    currentRoom = code; // 실제 방 ID는 코드 사용
    
    await startLocalVideo();
    socket.emit('join-room', { 
        roomId: code, 
        nickname: nick,
        roomTitle: title 
    });
    
    lobby.style.display = 'none';
    mainContent.classList.add('active');

    // 모바일이면 채팅 버튼 표시
    if (isMobile) chatBtn.style.display = 'flex';

    addChatMessage('시스템', `새로운 참가자가 방에 입장했습니다. (roomId: ${code})`);
});

// 나가기
leaveBtn.addEventListener('click', () => {
    if (isScreenSharing) {
        stopScreenShare();
    }
    location.reload();
});

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

// 화면 공유 토글
screenShareBtn.addEventListener('click', () => {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
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

// 기존 코드 삭제하고 아래로 교체
socket.on('room-info', (data) => {
    // 방 정보 업데이트
    currentRoomCode = data.roomCode;
    currentRoomTitle = data.title;
    
    // 헤더에 방 제목 표시
    roomName.textContent = data.title;
    
    // 로비 정보 영역 업데이트
    if (displayRoomTitle && displayRoomCode && roomInfo) {
        displayRoomTitle.textContent = data.title || '제목 없음';
        displayRoomCode.textContent = data.roomCode;
        roomInfo.style.display = 'block';
    }
    
    // URL 업데이트 (히스토리 추가 없이)
    const newUrl = `${window.location.pathname}?code=${data.roomCode}`;
    window.history.replaceState({}, '', newUrl);
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

    // 일반 비디오 제거
    const wrapper = document.getElementById(`wrapper-${data.userId}`);
    if (wrapper) {
        wrapper.style.transition = 'opacity 0.3s';
        wrapper.style.opacity = '0';
        setTimeout(() => wrapper.remove(), 300);
    }
    
    // 화면 공유 비디오 제거
    const screenWrapper = document.getElementById(`wrapper-${data.userId}-screen`);
    if (screenWrapper) {
        screenWrapper.style.transition = 'opacity 0.3s';
        screenWrapper.style.opacity = '0';
        setTimeout(() => screenWrapper.remove(), 300);
    }
    
    addChatMessage('시스템', `${data.nickname}님이 퇴장했습니다.`);
});

socket.on('chat-message', (data) => {
    addChatMessage(data.nickname, data.message);
});

socket.on('screen-share-started', (data) => {
    addChatMessage('시스템', `${data.nickname}님이 화면 공유를 시작했습니다.`);
});

socket.on('screen-share-stopped', (data) => {
    addChatMessage('시스템', `${data.nickname}님이 화면 공유를 중지했습니다.`);
});

console.log(socket);