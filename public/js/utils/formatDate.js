export function formatDate(date) {
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    let hours = date.getHours();
    
    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12 || 12;
    
    const HH = String(hours).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${yyyy}년 ${MM}월 ${dd}일 ${ampm} ${HH}:${minutes}`;
}

export function chatTextDateFormat(date) {
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    
    let hours = date.getHours();
    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12 || 12;
    
    const HH = String(hours).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // ${MM}월 ${dd}일
    return `${ampm} ${HH}:${minutes}`;
}

export function getToday(date) {
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');

    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12 || 12;

    const HH = String(hours).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return `${yyyy}년 ${MM}월 ${dd}일 ${ampm} ${HH}:${minutes}:${second}`;
}