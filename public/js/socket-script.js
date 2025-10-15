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

function detectDeviceCapability() {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const cores = navigator.hardwareConcurrency || 2;
    const memory = navigator.deviceMemory || 4;
    
    if (isMobileDevice || cores <= 2 || memory <= 4) return 'low';
    if (cores <= 4 || memory <= 8) return 'medium';
    return 'high';
}

// 동적 비디오 설정
function getOptimalVideoConstraints() {
    const capability = detectDeviceCapability();
    const participantCount = Object.keys(peerConnections).length + 1;
    
    // 참가자 많으면 품질 낮춤
    if (participantCount >= 7) {
        return {
            width: { ideal: 320, max: 480 },
            height: { ideal: 240, max: 360 },
            frameRate: { ideal: 15, max: 20 }
        };
    }
    
    if (participantCount >= 4 || capability === 'low') {
        return {
            width: { ideal: 480, max: 640 },
            height: { ideal: 360, max: 480 },
            frameRate: { ideal: 20, max: 24 }
        };
    }
    
    if (capability === 'medium') {
        return {
            width: { ideal: 640, max: 960 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 }
        };
    }
    
    // 고성능 & 소수 인원
    return {
        width: { ideal: 960, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 }
    };
}

// 짧은 코드 생성 함수 (10자리)
function generateShortCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code + '-' + Date.now().toString(36).slice(-5);
}

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    sdpSemantics: 'unified-plan',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// DOM 요소 - 수정됨
const lobby = document.getElementById('lobby');
const mainContent = document.getElementById('mainContent');

// 방 만들기 탭 요소
const nicknameInputCreate = document.getElementById('nicknameInputCreate');
const roomTitleInput = document.getElementById('roomTitleInput');
const roomCodeInputCreate = document.getElementById('roomCodeInputCreate');
const createRoomBtn = document.getElementById('createRoomBtn');

// 방 참가하기 탭 요소
const nicknameInputJoin = document.getElementById('nicknameInputJoin');
const roomCodeInputJoin = document.getElementById('roomCodeInputJoin');
const joinRoomBtn = document.getElementById('joinRoomBtn');

// 공통 요소
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
    if (code && roomCodeInputJoin) roomCodeInputJoin.value = code;
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
        const videoConstraints = getOptimalVideoConstraints();
        
        localStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1  // 모노 오디오로 대역폭 절약
            }
        });

        addVideoElement('local', localStream, nickname + ' (나)', false);
        roomName.textContent = currentRoomTitle || currentRoomCode;
        
        // 콘솔에 적용된 설정 출력
        const settings = localStream.getVideoTracks()[0].getSettings();
        console.log('비디오 설정:', {
            해상도: `${settings.width}x${settings.height}`,
            프레임레이트: `${settings.frameRate}fps`,
            성능모드: detectDeviceCapability()
        });
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

    const streamToSend = isScreenSharing ? screenStream : localStream;
    
    streamToSend.getTracks().forEach(track => {
        const sender = pc.addTrack(track, streamToSend);
        
        // 비디오 트랙 비트레이트 제한
        if (track.kind === 'video' && !isScreenSharing) {
            const participantCount = Object.keys(peerConnections).length + 1;
            
            // 참가자 수에 따라 비트레이트 조정
            let maxBitrate;
            if (participantCount >= 7) {
                maxBitrate = 250000;  // 250kbps
            } else if (participantCount >= 4) {
                maxBitrate = 500000;  // 500kbps
            } else {
                maxBitrate = 1000000; // 1Mbps
            }
            
            const parameters = sender.getParameters();
            if (!parameters.encodings) {
                parameters.encodings = [{}];
            }
            parameters.encodings[0].maxBitrate = maxBitrate;
            
            sender.setParameters(parameters)
                .then(() => console.log(`✅ ${userName} 비트레이트: ${maxBitrate/1000}kbps`))
                .catch(e => console.warn('비트레이트 설정 실패:', e));
        }
    });

    pc.ontrack = (event) => {
        const stream = event.streams[0];
        const videoTrack = stream.getVideoTracks()[0];
        
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
                displaySurface: 'monitor',
                frameRate: { ideal: 15, max: 20 },
                width: { max: 1920 },
                height: { max: 1080 }
            },
            audio: false
        });

        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.contentHint = 'detail';
        }

        addVideoElement('local-screen', screenStream, nickname + '의 화면 (나)', true);

        for (let userId in peerConnections) {
            const pc = peerConnections[userId];
            const senders = pc.getSenders();
            
            const videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
            if (videoSender) {
                await videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
                
                const parameters = videoSender.getParameters();
                if (parameters.encodings && parameters.encodings[0]) {
                    parameters.encodings[0].maxBitrate = 1500000;
                    videoSender.setParameters(parameters);
                }
            }
        }

        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        isScreenSharing = true;
        screenShareBtn.classList.add('screen-sharing');
        
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

        socket.emit('screen-share-started', { nickname });
        console.log('🖥️ 화면 공유 시작');

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

    screenStream.getTracks().forEach(track => track.stop());
    removeVideoElement('local-screen');

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

    socket.emit('screen-share-stopped', { nickname });
}

// 방 입장 로직 통합
async function joinRoom(nick, title, code) {
    nickname = nick;
    currentRoomTitle = title;
    currentRoomCode = code;
    currentRoom = code;
    
    await startLocalVideo();
    socket.emit('join-room', { 
        roomId: code, 
        nickname: nick,
        roomTitle: title 
    });
    
    lobby.style.display = 'none';
    mainContent.classList.add('active');

    if (isMobile) chatBtn.style.display = 'flex';

    addChatMessage('시스템', `방에 입장했습니다. (방 코드: ${code})`);
}

// 방 만들기 버튼
createRoomBtn.addEventListener('click', async () => {
    const nick = nicknameInputCreate.value.trim();
    const title = roomTitleInput.value.trim();
    let code = roomCodeInputCreate.value.trim();
    
    if (!nick) {
        alert('닉네임을 입력하세요');
        return;
    }

    if (!title) {
        alert('방 제목을 입력하세요');
        return;
    }

    // 코드가 없으면 자동 생성
    if (!code) {
        code = generateShortCode();
    }

    await joinRoom(nick, title, code);
});

// 방 참가하기 버튼
joinRoomBtn.addEventListener('click', async () => {
    const nick = nicknameInputJoin.value.trim();
    const code = roomCodeInputJoin.value.trim();
    
    if (!nick) {
        alert('닉네임을 입력하세요');
        return;
    }

    if (!code) {
        alert('방 코드를 입력하세요');
        return;
    }

    await joinRoom(nick, '', code);
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

socket.on('room-info', (data) => {
    currentRoomCode = data.roomCode;
    currentRoomTitle = data.title;
    
    roomName.textContent = data.title;
    
    if (displayRoomTitle && displayRoomCode && roomInfo) {
        displayRoomTitle.textContent = data.title || '제목 없음';
        displayRoomCode.textContent = data.roomCode;
        roomInfo.style.display = 'block';
    }
    
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

    const wrapper = document.getElementById(`wrapper-${data.userId}`);
    if (wrapper) {
        wrapper.style.transition = 'opacity 0.3s';
        wrapper.style.opacity = '0';
        setTimeout(() => wrapper.remove(), 300);
    }
    
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

console.log('Socket.io 연결됨:', socket.connected);