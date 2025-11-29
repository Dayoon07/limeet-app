/**
 * 토스트 메시지를 표시합니다
 * @param {string} message - 표시할 메시지 (HTML 지원)
 * @param {Object} options - 옵션
 * @param {boolean} options.success - 성공 여부 (true: 초록색, false: 빨간색)
 * @param {number} options.duration - 표시 시간 (ms)
 * @param {string} options.position - 위치 ('top', 'bottom', 'center')
 */
export function showToast(message, options = {}) {
    const {
        success = true,
        duration = 3000,
        position = 'top'
    } = options;

    // === 1) 토스트 컨테이너 생성 (이미 있으면 기존 걸 사용)
    let container = document.querySelector('.custom-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'custom-toast-container';
        container.style.position = 'fixed';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.zIndex = '99999';

        switch (position) {
            case 'bottom':
                container.style.bottom = '80px';
                break;
            case 'center':
                container.style.top = '50%';
                container.style.transform = 'translate(-50%, -50%)';
                break;
            default:
                container.style.top = '50px';
        }

        document.body.appendChild(container);
    }

    // === 2) 새로운 토스트 생성
    const toast = document.createElement('div');
    toast.innerHTML = message;
    toast.className = 'custom-toast text-white sm:px-10 max-sm:px-5 py-2 rounded shadow-md z-50 text-center transition-all duration-300';

    // 색상 설정
    toast.style.backgroundColor = success ? 'rgb(102, 126, 234)' : 'rgb(239, 68, 68)';

    // 처음엔 투명하게
    toast.style.opacity = '0';

    // === 3) 기존 토스트는 아래로 밀리고, 새로운 토스트는 맨 위에 추가
    container.prepend(toast);

    // 애니메이션 시작
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    // === 4) duration 후 제거
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
            // 컨테이너가 비었으면 제거해서 position 문제 방지
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, duration);
}

/**
 * 에러 토스트
 */
export function showErrorToast(message, duration = 3000) {
    showToast(message, { success: false, duration });
}

/**
 * 성공 토스트
 */
export function showSuccessToast(message, duration = 3000) {
    showToast(message, { success: true, duration });
}
