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
const roomMetadata = {}; // 방 제목 등 메타데이터 저장

io.on('connection', (socket) => {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : (socket.handshake.address || socket.conn.remoteAddress);
    const userAgent = socket.handshake.headers['user-agent'] || '';

    console.log('새 사용자 연결:', socket.id, 'ip:', ip, 'ua:', userAgent);
    ipinfo(ip).then(info => console.log(info));

    // 방 입장 (닉네임 포함)
    // 방 입장 (닉네임 포함)
    socket.on('join-room', (data) => {
        const { roomId, nickname, roomTitle } = data;
        socket.join(roomId);

        // 방 초기화
        if (!rooms[roomId]) {
            rooms[roomId] = [];
            // 첫 번째 사용자가 방 제목 설정
            roomMetadata[roomId] = {
                title: roomTitle || roomId,
                roomCode: roomId,
                createdAt: new Date().toISOString()
            };
            console.log(`새 방 생성: ${roomId}, 제목: ${roomTitle || roomId}`);
        }

        // 사용자 정보 저장
        const userInfo = {
            id: socket.id,
            nickname: nickname
        };

        // 기존 사용자들에게 새 사용자 알림
        socket.to(roomId).emit('user-connected', {
            userId: socket.id,
            nickname: nickname
        });

        // 새 사용자에게 기존 사용자 목록 전송
        socket.emit('existing-users', rooms[roomId]);

        // 새 사용자에게 방 메타데이터 전송 (추가)
        socket.emit('room-info', roomMetadata[roomId]);

        // 방에 사용자 추가
        rooms[roomId].push(userInfo);
        socket.currentRoom = roomId;
        socket.nickname = nickname;

        console.log(`${nickname}(${socket.id})가 방 ${roomId}에 입장. 현재 인원: ${rooms[roomId].length}`);
    });

    // WebRTC Offer 전달
    socket.on('offer', (data) => {
        console.log(`Offer 전달: ${socket.id} -> ${data.target}`);
        io.to(data.target).emit('offer', {
            offer: data.offer,
            from: socket.id,
            nickname: socket.nickname
        });
    });

    // WebRTC Answer 전달
    socket.on('answer', (data) => {
        console.log(`Answer 전달: ${socket.id} -> ${data.target}`);
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

    // 채팅 메시지 전달
    socket.on('chat-message', (data) => {
        const roomId = socket.currentRoom;
        if (roomId) {
            socket.to(roomId).emit('chat-message', {
                nickname: data.nickname,
                message: data.message,
                timestamp: new Date().toISOString()
            });
            console.log(`[${roomId}](${new Date().toISOString()}) ${data.nickname}: ${data.message}`);
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
            console.log(`${data.nickname}(${socket.id})가 화면 공유를 시작했습니다.`);
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
            console.log(`${data.nickname}(${socket.id})가 화면 공유를 중지했습니다.`);
        }
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('사용자 연결 해제:', socket.id);

        // 모든 방에서 사용자 제거
        for (let roomId in rooms) {
            const userIndex = rooms[roomId].findIndex(user => user.id === socket.id);
            
            if (userIndex !== -1) {
                const user = rooms[roomId][userIndex];
                rooms[roomId].splice(userIndex, 1);
                
                // 다른 사용자들에게 퇴장 알림
                socket.to(roomId).emit('user-disconnected', {
                    userId: socket.id,
                    nickname: user.nickname
                });
                
                // 방이 비었으면 삭제
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                    console.log(`방 ${roomId} 삭제됨`);
                } else {
                    console.log(`${user.nickname}이(가) 방 ${roomId}에서 퇴장. 남은 인원: ${rooms[roomId].length}`);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("+----------------------------------------+");
    console.log(`|                                        |`);
    console.log(`|                                        |`);
    console.log(`|         http://localhost:${PORT}          |`);
    console.log(`|                                        |`);
    console.log(`|                                        |`);
    console.log("+----------------------------------------+");
});