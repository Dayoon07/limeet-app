"use strict";

import { getToday } from "./utils/formatDate.js";

async function backgroundImgChange() {
    const lobbyEl = document.querySelector(".lobby");
    const loadingEl = document.getElementById("loading");
    const imgUrl = `https://picsum.photos/seed/${Math.random().toString(36).substring(7)}/1920/1080`;

    try {
        // 이미지 로드 대기
        await new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imgUrl;
            img.onload = resolve;
            img.onerror = reject;
        });

        // 배경 적용
        lobbyEl.style.backgroundImage = `url(${imgUrl})`;
        lobbyEl.style.backgroundSize = "cover";
        lobbyEl.style.backgroundRepeat = "no-repeat";
        lobbyEl.style.backgroundPosition = "center"; // 오타 수정 (cemter → center)
    } catch (err) {
        console.error("이미지 로드 실패:", err);
    } finally {
        // 로딩 숨김
        loadingEl.style.display = "none";
    }
}

function reloadToday() {
    document.querySelector(".today").textContent = getToday(new Date());
}

window.addEventListener("load", () => {
    backgroundImgChange();
    setInterval(reloadToday, 1000);
    console.log("디스플레이 로딩 완료");

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
        // 방 코드가 있으면 "방 참가하기" 탭으로 전환
        document.querySelector('[data-tab="join"]').click();
        document.getElementById('roomCodeInput').value = code;
    }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        // 모든 탭 버튼과 콘텐츠 비활성화
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // 선택한 탭 활성화
        btn.classList.add('active');
        document.getElementById(tabName + 'Tab').classList.add('active');
    });
});
