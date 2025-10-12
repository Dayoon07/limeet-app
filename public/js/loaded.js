"use strict";

import { getToday } from "./utils/formatDate.js";

function backgroundImgChange() {
    document.querySelector(".lobby").style.backgroundImage =
        `url(https://picsum.photos/seed/${Math.random().toString(36).substring(7)}/1980/1080)`;
    document.querySelector(".lobby").style.backgroundSize = "cover";
    document.querySelector(".lobby").style.backgroundRepeat = "no-repeat";
    document.querySelector(".lobby").style.backgroundPosition = "cemter";
    setTimeout(() => document.getElementById("loading").style.display = "none", 1500);
}

function reloadToday() {
    document.querySelector(".today").textContent = getToday(new Date());
}

window.addEventListener("load", () => {
    backgroundImgChange();
    setInterval(reloadToday, 1000);
    console.log("디스플레이 로딩 완료");
});