const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const ipinfo = require('ipinfo');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

// 방별 사용자 정보 및 메타데이터 저장
const rooms = {};
const roomMetadata = {};    // 방 제목, 비밀번호, 호스트 등 메타데이터
const roomPasswords = {};   // 비밀번호 저장
const recordings = {};      // 녹화 데이터 저장
const chatHistory = {};     // 채팅 히스토리
const hostUsers = {}; // 호스트 관리

io.on('connection', (socket) => {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : (socket.handshake.address || socket.conn.remoteAddress);
    const userAgent = socket.handshake.headers['user-agent'] || '';

    console.log('새 사용자 연결:', socket.id, 'ip:', ip, 'ua:', userAgent);
    ipinfo(ip).then(info => console.log(info));

    // 방 입장 (닉네임 포함, 비밀번호 검증)
    socket.on('join-room', (data) => {
        const { roomId, nickname, roomTitle, password } = data;
        
        // 방이 존재하고 비밀번호가 설정되어 있으면 검증
        if (rooms[roomId] && roomMetadata[roomId]?.password) {
            if (password !== roomMetadata[roomId].password) {
                socket.emit('join-error', { message: '비밀번호가 일치하지 않습니다.' });
                console.log(`입장 실패: ${nickname}이(가) 방 ${roomId}에 잘못된 비밀번호로 접근 시도`);
                return;
            }
        }

        socket.join(roomId);

        // 방 초기화
        if (!rooms[roomId]) {
            rooms[roomId] = [];
            chatHistory[roomId] = [];
            roomMetadata[roomId] = {
                title: roomTitle || roomId,
                roomCode: roomId,
                createdAt: new Date().toISOString(),
                hostId: socket.id,
                password: null,
                isRecording: false
            };
            console.log(`새 방 생성: ${roomId}, 제목: ${roomTitle || roomId}, 호스트: ${socket.id}`);
        }

        // 사용자 정보 저장
        const userInfo = {
            id: socket.id,
            nickname: nickname,
            isMuted: false,
            isHost: roomMetadata[roomId].hostId === socket.id
        };

        // 기존 사용자들에게 새 사용자 알림
        socket.to(roomId).emit('user-connected', {
            userId: socket.id,
            nickname: nickname,
            isHost: userInfo.isHost
        });

        // 새 사용자에게 기존 사용자 목록 전송
        socket.emit('existing-users', rooms[roomId]);

        // 새 사용자에게 방 메타데이터 전송
        socket.emit('room-info', roomMetadata[roomId]);

        // 채팅 히스토리 전송
        socket.emit('chat-history', chatHistory[roomId]);

        // 방에 사용자 추가
        rooms[roomId].push(userInfo);
        socket.currentRoom = roomId;
        socket.nickname = nickname;
        socket.userId = socket.id;

        console.log(`${nickname}(${socket.id})가 방 ${roomId}에 입장. 현재 인원: ${rooms[roomId].length}`);

        if (rooms[roomId].length === 1) {
            hostUsers[roomId] = socket.id;
            socket.emit('set-as-host');
        }
    });

    socket.on('create-room', (data) => {
        const { roomId, nickname, roomTitle, password } = data;
        
        if (password) {
            roomPasswords[roomId] = password;
        }
        
        console.log(`방 생성: ${roomId}, 비밀번호: ${password ? '설정됨' : '없음'}`);
    });

    socket.on('verify-room-password', (data) => {
        const { roomId, nickname } = data;
        
        // 방이 존재하는지 확인
        if (!rooms[roomId]) {
            socket.emit('room-not-found');
            return;
        }
        
        // 비밀번호 확인
        if (roomPasswords[roomId]) {
            socket.emit('request-password', { roomId });
        } else {
            socket.emit('password-verified', { roomId });
        }
    });

    socket.on('submit-password', (data) => {
        const { roomId, password, nickname } = data;
        
        if (roomPasswords[roomId] && roomPasswords[roomId] === password) {
            socket.emit('password-verified', { roomId });
        } else {
            socket.emit('password-incorrect');
        }
    });

    // WebRTC Offer 전달
    socket.on('offer', (data) => {
        io.to(data.target).emit('offer', {
            offer: data.offer,
            from: socket.id,
            nickname: socket.nickname
        });
    });

    // WebRTC Answer 전달
    socket.on('answer', (data) => {
        io.to(data.target).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    // ICE Candidate 전달
    socket.on('ice-candidate', (data) => {
        io.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });

    // 채팅 메시지 전달 및 저장
    socket.on('chat-message', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            const message = {
                nickname: data.nickname,
                message: data.message,
                timestamp: new Date().toISOString(),
                userId: socket.id
            };
            
            // 채팅 히스토리에 저장
            chatHistory[roomId].push(message);

            socket.to(roomId).emit('chat-message', message);
            console.log(`[${roomId}](${message.timestamp}) ${data.nickname}: ${data.message}`);
        }
    });

    // 파일 공유 (URL 기반)
    socket.on('share-file', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('file-shared', {
                nickname: socket.nickname,
                fileName: data.fileName,
                fileUrl: data.fileUrl,
                fileSize: data.fileSize,
                fileType: data.fileType,
                timestamp: new Date().toISOString()
            });
            console.log(`${socket.nickname}이(가) 파일 공유: ${data.fileName}`);
        }
    });

    // 화면 공유 시작 알림
    socket.on('screen-share-started', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('screen-share-started', {
                nickname: data.nickname,
                userId: socket.id
            });
        }
    });

    // 화면 공유 중지 알림
    socket.on('screen-share-stopped', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('screen-share-stopped', {
                nickname: data.nickname,
                userId: socket.id
            });
        }
    });

    // 가상 배경/블러 처리 상태 공유
    socket.on('background-effect-changed', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('user-background-effect', {
                userId: socket.id,
                effectType: data.effectType, // 'none', 'blur', 'color', 'image'
                effectData: data.effectData
            });
        }
    });

    // 손 들기
    socket.on('raise-hand', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('raise-hand', {
                nickname: data.nickname,
                userId: data.userId
            });
            console.log(`✋ ${data.nickname}이(가) 손을 들었습니다.`);
        }
    });

    // 손 내리기
    socket.on('lower-hand', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('lower-hand', {
                nickname: data.nickname,
                userId: data.userId
            });
            console.log(`${data.nickname}이(가) 손을 내렸습니다.`);
        }
    });

    // 녹화 시작 (호스트만)
    socket.on('start-recording', (data) => {
        const roomId = socket.currentRoom;
        if (roomId && roomMetadata[roomId].hostId === socket.id) {
            roomMetadata[roomId].isRecording = true;
            recordings[roomId] = {
                startTime: new Date().toISOString(),
                data: []
            };
            io.to(roomId).emit('recording-started', {
                timestamp: recordings[roomId].startTime
            });
            console.log(`녹화 시작: ${roomId}`);
        }
    });

    // 녹화 데이터 수집
    socket.on('recording-data', (data) => {
        const roomId = socket.currentRoom;
        if (roomId && recordings[roomId]) {
            recordings[roomId].data.push({
                timestamp: new Date().toISOString(),
                type: data.type,
                data: data.data,
                userId: socket.id
            });
        }
    });

    // 녹화 중지 (호스트만)
    socket.on('stop-recording', (data) => {
        const roomId = socket.currentRoom;
        if (roomId && roomMetadata[roomId].hostId === socket.id) {
            roomMetadata[roomId].isRecording = false;
            const recording = recordings[roomId];
            
            if (recording) {
                recording.endTime = new Date().toISOString();
                recording.title = data.title || `Recording-${roomId}-${new Date().getTime()}`;
                
                io.to(roomId).emit('recording-stopped', {
                    title: recording.title,
                    endTime: recording.endTime
                });
                console.log(`녹화 중지: ${roomId}, 제목: ${recording.title}`);
            }
        }
    });

    // 비밀번호 설정 (호스트만)
    socket.on('set-room-password', (data) => {
        const roomId = socket.currentRoom;
        if (roomId && roomMetadata[roomId].hostId === socket.id) {
            roomMetadata[roomId].password = data.password || null;
            io.to(roomId).emit('room-password-changed', {
                hasPassword: !!data.password
            });
            console.log(`방 ${roomId}의 비밀번호 ${data.password ? '설정됨' : '제거됨'}`);
        }
    });

    // 참가자 음소거 (호스트만)
    socket.on('mute-user', (data) => {
        const roomId = socket.currentRoom;
        if (roomId && roomMetadata[roomId].hostId === socket.id) {
            const targetUser = rooms[roomId]?.find(u => u.id === data.userId);
            if (targetUser) {
                targetUser.isMuted = true;
                io.to(data.userId).emit('you-have-been-muted', {
                    mutedBy: socket.nickname
                });
                socket.to(roomId).emit('user-muted', {
                    userId: data.userId,
                    nickname: targetUser.nickname
                });
                console.log(`${socket.nickname}이 ${targetUser.nickname}을 음소거했습니다.`);
            }
        }
    });

    // 참가자 강제 퇴장 (호스트만)
    socket.on('kick-user', (data) => {
        const roomId = socket.currentRoom;
        if (roomId && roomMetadata[roomId].hostId === socket.id) {
            io.to(data.userId).emit('you-have-been-kicked', {
                kickedBy: socket.nickname
            });
            io.sockets.sockets.get(data.userId)?.leave(roomId);
            console.log(`${socket.nickname}이 사용자 ${data.userId}를 강제 퇴장시켰습니다.`);
        }
    });

    // 화질 설정
    socket.on('set-video-quality', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('user-quality-changed', {
                userId: socket.id,
                quality: data.quality // 'low', 'medium', 'high'
            });
        }
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('사용자 연결 해제:', socket.id);

        for (let roomId in rooms) {
            const userIndex = rooms[roomId].findIndex(user => user.id === socket.id);
            
            if (userIndex !== -1) {
                const user = rooms[roomId][userIndex];
                const wasHost = roomMetadata[roomId].hostId === socket.id;
                
                rooms[roomId].splice(userIndex, 1);
                
                socket.to(roomId).emit('user-disconnected', {
                    userId: socket.id,
                    nickname: user.nickname
                });
                
                // 호스트가 나가면 새 호스트 지정
                if (wasHost && rooms[roomId].length > 0) {
                    const newHostId = rooms[roomId][0].id;
                    roomMetadata[roomId].hostId = newHostId;
                    io.to(roomId).emit('new-host-assigned', {
                        newHostId: newHostId,
                        newHostNickname: rooms[roomId][0].nickname
                    });
                    console.log(`새 호스트 지정: ${rooms[roomId][0].nickname}`);
                }
                
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                    delete roomMetadata[roomId];
                    delete chatHistory[roomId];
                    if (recordings[roomId]) {
                        delete recordings[roomId];
                    }
                    console.log(`방 ${roomId} 삭제됨`);
                }
            }
        }
    });

    socket.on('mute-user', (data) => {
        if (hostUsers[socket.currentRoom] === socket.id) {
            io.to(data.targetUserId).emit('mute-user', data);
            io.to(socket.currentRoom).emit('chat-message', {
                nickname: '시스템',
                message: `${data.userName}님이 음소거되었습니다.`,
                timestamp: new Date().toISOString()
            });
        }
    });

    socket.on('unmute-user', (data) => {
        if (hostUsers[socket.currentRoom] === socket.id) {
            io.to(data.targetUserId).emit('unmute-user', data);
        }
    });

    socket.on('remove-user', (data) => {
        if (hostUsers[socket.currentRoom] === socket.id) {
            io.to(data.targetUserId).emit('remove-user', data);
            // 타겟 사용자 연결 끊기
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("+----------------------------------------+");
    console.log(`|                                        |`);
    console.log(`|      Limeet Server Running             |`);
    console.log(`|      http://localhost:${PORT}             |`);
    console.log(`|                                        |`);
    console.log("+----------------------------------------+");
});