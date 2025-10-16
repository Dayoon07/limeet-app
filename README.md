# limit-meet-app

![](https://dayoon07.github.io/static-page-test/img/web-rtc-meet-pro-test-img-1.png)
![](https://dayoon07.github.io/static-page-test/img/web-rtc-meet-pro-test-img-2.png)

## 프로젝트 소개

WebRTC 기술을 활용하여 Zoom과 같은 실시간 화상 회의 기능을 구현한 웹 애플리케이션입니다. 별도의 플러그인 설치 없이 브라우저만으로 영상 통화, 채팅, 화면 공유 등의 기능을 제공합니다.

**현재 상태:** MVP (Minimum Viable Product)  
**향후 계획:** 지속적인 기능 추가 및 개선 예정

## 주요 기능

### 화상 회의
- **실시간 영상/음성 통화**: WebRTC P2P 연결을 통한 고품질 미디어 스트리밍
- **다자간 통화 지원**: 여러 참가자가 동시에 회의 참여 가능
- **카메라/마이크 제어**: 실시간으로 비디오/오디오 ON/OFF 전환
- **반응형 비디오 그리드**: 참가자 수에 따라 자동으로 레이아웃 조정

### 화면 공유
- **데스크톱 화면 공유**: 전체 화면, 특정 창, 브라우저 탭 공유 가능
- **실시간 공유 알림**: 참가자들에게 화면 공유 시작/종료 알림
- **고품질 화면 전송**: 선명한 화질로 화면 콘텐츠 전달

### 실시간 채팅
- **텍스트 채팅**: 회의 중 실시간 메시지 교환
- **반응형 채팅 UI**: 데스크톱(사이드바), 모바일(모달) 최적화
- **미확인 메시지 알림**: 모바일에서 채팅창이 닫혀있을 때 뱃지 표시

### 방 관리
- **자동 방 코드 생성**: 6자리 고유 코드 자동 생성
- **방 코드로 입장**: 기존 회의실에 코드로 참여
- **방 제목 설정**: 회의 목적에 맞는 방 이름 지정
- **URL 공유**: 방 코드가 포함된 링크로 간편 초대

### 반응형 디자인
- **모바일 최적화**: 스마트폰, 태블릿에서 원활한 사용
- **가로/세로 모드 지원**: 디바이스 방향에 따른 레이아웃 자동 조정
- **터치 제스처 지원**: 모바일 환경에 최적화된 인터랙션

## 기술 스택

### Frontend
- **Vanilla JavaScript (ES6+)**: 모듈 시스템, async/await 활용
- **WebRTC API (JS)**: RTCPeerConnection , getUserMedia, getDisplayMedia
- **Socket.IO Client**: 실시간 시그널링 통신
- **CSS3**: Flexbox, Grid, 반응형 미디어 쿼리

### Backend
- **Node.js**: 서버 런타임 환경
- **Express.js 5.1.0**: 웹 서버 프레임워크
- **Socket.IO 4.8.1**: WebSocket 기반 실시간 통신

### WebRTC 인프라
- **STUN 서버**: Google Public STUN 서버 활용
  - `stun:stun.l.google.com:19302`
  - `stun:stun1.l.google.com:19302`

## 설치 및 실행

### 사전 요구사항
- Node.js 14.x 이상
- npm 또는 yarn

### 설치 방법

```bash
# 저장소 클론
git clone https://github.com/yourusername/web-rtc-meet.git

# 프로젝트 디렉토리 이동
cd web-rtc-meet

# 의존성 패키지 설치
npm install 또는 yarn install
```

### 실행 방법

```bash
# 개발 서버 시작
npm start 또는 yarn install

# 브라우저에서 접속
http://localhost:3000
```

## 사용 방법

### 1. 회의실 만들기
1. 닉네임 입력
2. 방 제목 입력 (선택사항)
3. 방 코드 입력 또는 자동 생성
4. "방 만들기 / 입장하기" 버튼 클릭

### 2. 기존 회의실 입장
1. 닉네임 입력
2. 공유받은 방 코드 입력
3. "방 만들기 / 입장하기" 버튼 클릭

### 3. 회의 제어
- **마이크**: 하단 컨트롤 바에서 마이크 아이콘 클릭
- **카메라**: 카메라 아이콘으로 비디오 ON/OFF
- **화면 공유**: 모니터 아이콘으로 화면 공유 시작/중지
- **채팅**: 채팅 아이콘으로 메시지 송수신
- **나가기**: 빨간색 나가기 버튼으로 회의 종료

## 프로젝트 구조

```
limit-meet-app/
├── public/
│   ├── css/
│   │   └── style.css              # 스타일시트
│   ├── js/
│   │   ├── socket-script.js       # WebRTC 및 Socket.IO 로직
│   │   ├── loaded.js              # 초기 로딩 처리
│   │   └── utils/
│   │       └── formatDate.js      # 날짜/시간 포맷팅 유틸
│   ├── img/                       # 이미지 리소스
│   └── index.html                 # 메인 HTML
├── server.js                      # Express + Socket.IO 서버
├── package.json                   # 프로젝트 메타데이터
└── README.md                      # 프로젝트 문서
```

## 주요 구현 사항

### WebRTC 연결 흐름
1. **미디어 스트림 획득**: `getUserMedia()`로 카메라/마이크 접근
2. **시그널링**: Socket.IO를 통한 Offer/Answer/ICE Candidate 교환
3. **P2P 연결 수립**: RTCPeerConnection으로 직접 연결
4. **미디어 스트림 교환**: `addTrack()`으로 로컬 스트림 전송

### 화면 공유 구현
- `getDisplayMedia()` API 활용
- `contentHint: 'detail'`로 화면 공유 트랙 구분
- `replaceTrack()`으로 동적 트랙 교체

### 시그널링 서버
- Socket.IO 이벤트 기반 메시지 라우팅
- 방(Room) 단위 사용자 관리
- 연결/해제 시 자동 정리

## 향후 개발 계획

1. 녹화 기능
2. 가상 배경 (배경 블러, 배경 교체)
3. 손들기 기능
4. 채팅 파일 공유
5. 회의실 비밀번호 설정
6. 참가자 음소거/강퇴 (호스트 기능)
7. 그리드/스피커 뷰 전환
8. 화질 설정 옵션

## 라이선스

ISC License
