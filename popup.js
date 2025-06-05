// 페이지 로드 시 DOM 요소 초기화
document.addEventListener('DOMContentLoaded', async function() {
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
  
  // 탭 전환 기능 초기화
  initTabs();
  
  // 오류 신고 기능 초기화
  initErrorReporting();
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

// 탭 기능 초기화
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      
      // 모든 탭 버튼 비활성화
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
      });
      
      // 모든 탭 컨텐츠 숨기기
      tabPanes.forEach(pane => {
        pane.classList.remove('active');
      });
      
      // 선택한 탭 버튼 및 컨텐츠 활성화
      button.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    });
  });
}

// 오류 신고 기능 초기화
function initErrorReporting() {
  const reportForm = document.getElementById('reportForm');
  const reportStatus = document.getElementById('reportStatus');
  
  // 현재 URL 정보 가져와서 문제 URL 필드에 미리 채우기
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      document.getElementById('problemUrl').value = tabs[0].url;
    }
  });
  
  // 폼 제출 이벤트 핸들러
  reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // 폼 데이터 수집
    const problemUrl = document.getElementById('problemUrl').value.trim();
    const problemDescription = document.getElementById('problemDescription').value.trim();
    const contactEmail = document.getElementById('contactEmail').value.trim();
    
    // 기본 검증
    if (!problemUrl) {
      reportStatus.textContent = '오류가 발생한 URL을 입력해주세요.';
      reportStatus.className = 'report-status error';
      return;
    }
    
    // 전송 중 상태 표시
    reportStatus.textContent = '신고 내용을 전송 중입니다...';
    reportStatus.className = 'report-status sending';
    
    try {
      // 브라우저 및 확장 프로그램 정보 수집
      const browserInfo = navigator.userAgent;
      const extensionInfo = chrome.runtime.getManifest().version;
      
      // 오류 데이터 구성
      const reportData = {
        problemUrl,
        problemDescription,
        contactEmail,
        browserInfo,
        extensionVersion: extensionInfo,
        timestamp: new Date().toISOString(),
      };
      
      // 개발자 이메일로 메일 보내기 (mailto 링크 사용)
      const subject = encodeURIComponent(`[WebP 확장프로그램 오류] ${problemUrl}`);
      const body = encodeURIComponent(
        `문제 URL: ${problemUrl}\n\n` +
        `문제 설명: ${problemDescription || '설명이 제공되지 않았습니다.'}\n\n` +
        `브라우저 정보: ${browserInfo}\n` +
        `확장 프로그램 버전: ${extensionInfo}\n` +
        `보고 시간: ${new Date().toLocaleString()}\n\n` +
        `연락처 이메일: ${contactEmail || '제공되지 않음'}`
      );
      
      // mailto 링크 생성
      const mailtoLink = `mailto:report.greenee@gmail.com?subject=${subject}&body=${body}`;
      
      // 새 탭에서 mailto 링크 열기
      chrome.tabs.create({ url: mailtoLink });
      
      // 성공 메시지 표시
      reportStatus.textContent = '이메일 앱이 열립니다. 신고 내용을 검토 후 전송해주세요.';
      reportStatus.className = 'report-status success';
      
      // 폼 초기화
      // reportForm.reset(); // 사용자가 이메일을 보낸 후 수정이 필요할 수 있어 초기화하지 않음
      
    } catch (error) {
      console.error('오류 신고 전송 중 오류 발생:', error);
      reportStatus.textContent = '신고를 전송하는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.';
      reportStatus.className = 'report-status error';
    }
  });
}
