"use strict";

import { getToday } from "./utils/formatDate.js";

async function backgroundImgChange() {
    const lobbyEl = document.querySelector(".lobby");
    const loadingEl = document.getElementById("loading");
    const imgUrl = `https://picsum.photos/seed/${Math.random().toString(36).substring(7)}/1980/1080`;

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
});