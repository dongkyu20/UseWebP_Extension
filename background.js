// background.js

// 설정 - 실제 환경에 맞게 조정하세요
const CDN_HOST = "storage.cloud.google.com";
const CDN_PATH_PREFIX = "/cdn.ecarbon.kr/";

// 확장 프로그램 상태 (기본값: 활성화)
let isExtensionEnabled = true;

// 초기화 시 저장된 상태 불러오기
chrome.storage.local.get({ isEnabled: true }, (result) => {
  isExtensionEnabled = result.isEnabled;
  console.log(`[WebP Extension] 확장 프로그램 상태: ${isExtensionEnabled ? '활성화' : '비활성화'}`);
});

// 메시지 수신 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleExtension') {
    isExtensionEnabled = message.isEnabled;
    console.log(`[WebP Extension] 확장 프로그램 상태 변경: ${isExtensionEnabled ? '활성화' : '비활성화'}`);
    
    // 모든 탭에 상태 변경 알림
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        // chrome:// 페이지 등은 오류가 발생할 수 있으므로 무시
        try {
          chrome.tabs.sendMessage(tab.id, { action: 'updateExtensionState', isEnabled: isExtensionEnabled })
            .catch(() => {});
        } catch (error) {}
      });
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'getExtensionState') {
    sendResponse({ isEnabled: isExtensionEnabled });
    return true;
  }
});

/**
 * 원본 URL에서 CDN URL로 변환합니다.
 * @param {string} originalUrl - 원본 이미지 URL
 * @returns {string} CDN의 WebP URL
 */
function convertToCdnUrl(originalUrl) {
  // 확장 프로그램이 비활성화 상태면 변환하지 않음
  if (!isExtensionEnabled) {
    return null;
  }

  try {
    // 기존 rules_redirect.json의 정규식과 동일한 패턴 사용
    const regex = /^https:\/\/([^/]+)\/(?:.+\/)?([^/\.]+)\.(png|jpg|jpeg)$/i;
    const match = originalUrl.match(regex);
    
    if (!match) return null;
    
    // 캡처 그룹: \1=호스트, \2=파일명(확장자 제외)
    const [, host, filename] = match;
    
    // CDN URL 생성 - rules_redirect.json의 regexSubstitution과 동일한 패턴
    return `https://${CDN_HOST}${CDN_PATH_PREFIX}${host}/${filename}.webp`;
  } catch (error) {
    console.error("[WebP Extension] URL 변환 오류:", error);
    return null;
  }
}

/**
 * 지정된 URL이 유효한지 HEAD 요청으로 확인합니다.
 * @param {string} url - 확인할 URL
 * @returns {Promise<boolean>} URL이 유효하면 true, 그렇지 않으면 false
 */
async function checkUrlExists(url) {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      cache: 'no-store'
    });
    return response.ok; // 200-299 상태 코드이면 true
  } catch (error) {
    console.error(`[WebP Extension] URL 확인 오류 (${url}):`, error);
    return false;
  }
}

/**
 * 이미지 요청을 처리합니다.
 */
chrome.webRequest.onBeforeRequest.addListener(
  async function(details) {
    // 확장 프로그램이 비활성화 상태면 원본 요청 진행
    if (!isExtensionEnabled) {
      return { cancel: false };
    }
    
    // 이미 리다이렉트된 요청인지 확인 (무한 루프 방지)
    if (details.url.includes(CDN_HOST)) {
      return { cancel: false }; // 원래 요청 진행
    }
    
    // 이미지 URL이 패턴과 일치하는지 확인
    const cdnUrl = convertToCdnUrl(details.url);
    if (!cdnUrl) {
      return { cancel: false }; // 원래 요청 진행
    }
    
    // CDN에 이미지가 존재하는지 확인
    const exists = await checkUrlExists(cdnUrl);
    
    if (exists) {
      console.log(`[WebP Extension] CDN WebP 이미지 존재함, 리다이렉트: ${cdnUrl}`);
      return { redirectUrl: cdnUrl };
    } else {
      console.log(`[WebP Extension] CDN WebP 이미지 없음, 원본 사용: ${details.url}`);
      return { cancel: false }; // 원래 요청 진행
    }
  },
  { urls: ["<all_urls>"], types: ["image"] },
  ["blocking"]
);

console.log("[WebP Extension] 백그라운드 스크립트 로드됨");
