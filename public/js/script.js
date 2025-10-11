const socket = io();
const peerConnections = {};
let localStream = null;
let currentRoom = null;

// ICE 서버 설정 (Google 무료 STUN 서버)
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

const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const status = document.getElementById('status');
const videosContainer = document.getElementById('videosContainer');

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

        videosContainer.innerHTML = '';
        
        const wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.id = 'local-wrapper';
        
        const video = document.createElement('video');
        video.id = 'localVideo';
        video.srcObject = localStream;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = '나';
        
        wrapper.appendChild(video);
        wrapper.appendChild(label);
        videosContainer.appendChild(wrapper);
        
        status.textContent = `연결됨 - 방: ${currentRoom}`;
    } catch (err) {
        console.error('카메라 접근 오류:', err);
        status.textContent = '카메라 접근 실패';
        alert('카메라와 마이크 권한이 필요합니다.');
    }
}

// Peer Connection 생성
function createPeerConnection(userId) {
    const pc = new RTCPeerConnection(configuration);

    // 로컬 스트림 추가
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // 원격 스트림 수신
    pc.ontrack = (event) => {
        console.log('원격 스트림 수신:', userId);
        
        let wrapper = document.getElementById(`wrapper-${userId}`);
        
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'video-wrapper';
            wrapper.id = `wrapper-${userId}`;
            
            const video = document.createElement('video');
            video.id = `video-${userId}`;
            video.srcObject = event.streams[0];
            video.autoplay = true;
            video.playsInline = true;
            
            const label = document.createElement('div');
            label.className = 'video-label';
            label.textContent = `참가자 ${userId.substring(0, 6)}`;
            
            wrapper.appendChild(video);
            wrapper.appendChild(label);
            videosContainer.appendChild(wrapper);
        }
    };

    // ICE candidate
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: userId,
                candidate: event.candidate
            });
        }
    };

    // 연결 상태 모니터링
    pc.onconnectionstatechange = () => console.log(`${userId} 연결 상태:`, pc.connectionState);
    return pc;
}

// 방 입장
joinBtn.addEventListener('click', async () => {
    const roomId = roomInput.value.trim();
    
    if (!roomId) {
        alert('방 이름을 입력하세요');
        return;
    }

    currentRoom = roomId;
    await startLocalVideo();
    socket.emit('join-room', roomId);
    
    joinBtn.disabled = true;
    leaveBtn.disabled = false;
    roomInput.disabled = true;
});

// 방 나가기
leaveBtn.addEventListener('click', () => leaveRoom());

function leaveRoom() {
    // 모든 연결 종료
    for (let userId in peerConnections) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }

    // 로컬 스트림 종료
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // UI 초기화
    videosContainer.innerHTML = `
        <div class="empty-state">
            <h2>방에 입장하세요</h2>
            <p>위에서 방 이름을 입력하고 입장 버튼을 클릭하세요</p>
        </div>
    `;

    socket.disconnect();
    socket.connect();

    currentRoom = null;
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    roomInput.disabled = false;
    status.textContent = '대기 중...';
}

// 기존 사용자 목록 수신
socket.on('existing-users', async (users) => {
    console.log('기존 사용자:', users);
    
    for (let userId of users) {
        const pc = createPeerConnection(userId);
        peerConnections[userId] = pc;

        // Offer 생성
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', {
            target: userId,
            offer
        });
    }
});

// 새 사용자 입장
socket.on('user-connected', (userId) => {
    console.log('새 사용자 입장:', userId);
});

// Offer 수신
socket.on('offer', async (data) => {
    console.log('Offer 수신:', data.from);
    
    const pc = createPeerConnection(data.from);
    peerConnections[data.from] = pc;

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', { target: data.from, answer });
});

// Answer 수신
socket.on('answer', async (data) => {
    console.log('Answer 수신:', data.from);
    await peerConnections[data.from].setRemoteDescription(
        new RTCSessionDescription(data.answer)
    );
});

// ICE Candidate 수신
socket.on('ice-candidate', async (data) => {
    if (peerConnections[data.from]) {
        await peerConnections[data.from].addIceCandidate(
            new RTCIceCandidate(data.candidate)
        );
    }
});

// 사용자 퇴장
socket.on('user-disconnected', (userId) => {
    console.log('사용자 퇴장:', userId);
    
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }

    const wrapper = document.getElementById(`wrapper-${userId}`);
    if (wrapper) wrapper.remove();
});