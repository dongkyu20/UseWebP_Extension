// 페이지 로드 시 DOM 요소 초기화
document.addEventListener('DOMContentLoaded', async () => {
  const toggleElement = document.getElementById('extensionToggle');
  const statusElement = document.getElementById('status');
  
  // 현재 활성화 상태 가져오기
  const { isEnabled } = await chrome.storage.local.get({ isEnabled: true });
  
  // 토글 버튼 상태 설정
  toggleElement.checked = isEnabled;
  updateStatusUI(isEnabled);
  
  // 토글 버튼 이벤트 핸들러
  toggleElement.addEventListener('change', async () => {
    const newState = toggleElement.checked;
    
    // 저장소에 상태 저장
    await chrome.storage.local.set({ isEnabled: newState });
    
    // UI 업데이트
    updateStatusUI(newState);
    
    // 백그라운드 스크립트에 메시지 전송
    chrome.runtime.sendMessage({ action: 'toggleExtension', isEnabled: newState });
    
    // 현재 탭의 콘텐츠 스크립트에 메시지 전송
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'updateExtensionState', isEnabled: newState })
        .catch(error => {
          // 탭이 chrome:// 페이지 등 접근할 수 없는 페이지인 경우 오류 무시
          console.log('현재 탭에 메시지를 보낼 수 없습니다.');
        });
    }
  });
});

// UI 상태 업데이트 함수
function updateStatusUI(isEnabled) {
  const statusElement = document.getElementById('status');
  
  if (isEnabled) {
    statusElement.textContent = '현재 활성화 상태입니다';
    statusElement.className = 'status enabled';
  } else {
    statusElement.textContent = '현재 비활성화 상태입니다';
    statusElement.className = 'status disabled';
  }
}
