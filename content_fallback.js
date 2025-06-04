// content_fallback.js

// --- 설정 (실제 원본 URL 구조에 맞게 조정하세요) ---
// CDN 설정
const CDN_HOST = "storage.cloud.google.com";
const CDN_PATH_PREFIX = "/cdn.ecarbon.kr/";

const ASSUMED_ORIGINAL_BASE_PATH = '/';
const ASSUMED_ORIGINAL_EXTENSIONS = ['png', 'jpg', 'jpeg'];

// 주기적 스캔 설정 (밀리초)
const PERIODIC_SCAN_INTERVAL = 2000; // 2초마다 새 이미지 스캔

// 최대 재시도 횟수
const MAX_RETRY_COUNT = 2;
// --- 설정 끝 ---

// 확장 프로그램 동작을 제외할 도메인 목록 (SNS 및 소셜 미디어)
const EXCLUDED_DOMAINS = [
  'instagram.com', 'www.instagram.com',
  'facebook.com', 'www.facebook.com', 'm.facebook.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'tiktok.com', 'www.tiktok.com',
  'pinterest.com', 'www.pinterest.com',
  'linkedin.com', 'www.linkedin.com',
  'snapchat.com', 'www.snapchat.com'
];

// 현재 페이지가 제외 대상인지 확인
const isExcludedDomain = () => {
  const currentHost = window.location.hostname.toLowerCase();
  return EXCLUDED_DOMAINS.some(domain => 
    currentHost === domain || currentHost.endsWith('.' + domain)
  );
};

// 현재 페이지가 제외 대상이면 스크립트 실행하지 않음
if (isExcludedDomain()) {
  WebPLogger.logInfo('[WebP Extension] SNS 또는 소셜 미디어 사이트에서는 동작하지 않습니다:', window.location.hostname);
  // 필요한 최소한의 함수만 빈 함수로 정의
  window.convertToCdnUrl = () => null;
  window.reconstructOriginalUrls = () => [];
  window.handleImageError = () => {};
  window.processImage = () => {};
  window.processAllImages = () => {};
  window.processExistingImages = () => {};
} else {
  // 이미지 URL -> 원본 URL 매핑 저장소 (전역 캐시)
  const imageUrlMappings = new Map();

/**
 * 원본 URL에서 CDN URL로 변환합니다.
 * @param {string} originalUrl - 원본 이미지 URL
 * @returns {string|null} CDN의 WebP URL 또는 변환할 수 없는 경우 null
 */
function convertToCdnUrl(originalUrl) {
  try {
    const regex = /^https:\/\/([^/]+)\/(.+?)(?:\.(png|jpe?g)(?:\?.*)?$|[_=](png|jpe?g)(?:$|\?|&)|atchFileId=.*_(png|jpe?g)(?:$|\?|&))/i;
    const match = originalUrl.match(regex);
    
    if (!match) return null;
    
    const [, host, path, ext1, ext2, ext3] = match;
    
    const extension = ext1 || ext2 || ext3;
    
    // URL 객체 생성하여 경로와 쿼리 파라미터 분리
    let url;
    try {
      url = new URL(originalUrl);
      console.log('debuging - URL instance:', url);
      console.log('debuging - URL string:', url.toString());
      console.log('debuging - pathname:', url.pathname);
      console.log('debuging - search:', url.search);
      console.log('debuging - hostname:', url.hostname);
    } catch (e) {
      WebPLogger.logError("[WebP Extension] URL 파싱 오류:", e);
      return null;
    }
    
    const queryParams = url.search.includes('/') ? '' : url.search; // '/'가 포함된 경우 빈 문자열 반환
    
    // logger.js의 parseUrlDetails 함수 사용
    const urlDetails = WebPLogger.parseUrlDetails(originalUrl);
    const filename = urlDetails.original_filename;
    const filenameBase = urlDetails.filename_base;

    // URL 인코딩 함수: 특정 특수 문자(%, &, =)만 인코딩
    const encodeSpecialChars = (str) => {
      return str.replace(/%/g, '%25')
                .replace(/\?/g, '%3F')
                .replace(/&/g, '%26')
                .replace(/=/g, '%3D');
    };

    // filenameBase와 queryParams 인코딩
    const encodedFilenameBase = encodeSpecialChars(filenameBase);
    const encodedQueryParams = queryParams ? encodeSpecialChars(queryParams) : '';

    // CDN URL 생성: {domain}/{original_path_query}{filename_base}.webp
    // 도메인과 파일명 사이에 '/' 추가
    const cdnUrl = `https://${CDN_HOST}${CDN_PATH_PREFIX}${host}/${encodedQueryParams}${encodedFilenameBase}.webp`;


    
    // 매핑 저장 (양방향)
    imageUrlMappings.set(originalUrl, cdnUrl);
    imageUrlMappings.set(cdnUrl, originalUrl);
    
    return cdnUrl;
  } catch (error) {
    WebPLogger.logError("[WebP Extension] URL 변환 오류:", error);
    return null;
  }
}

/**
 * 실패한 CDN .webp URL로부터 원본 이미지 URL을 재구성하려고 시도합니다.
 * @param {string} failedCdnUrl - 로드에 실패한 CDN의 .webp 이미지 URL.
 * @returns {string[]} 재구성 시도된 원본 URL 후보 목록.
 */
function reconstructOriginalUrls(failedCdnUrl) {
    // 캐시된 매핑이 있는지 확인
    const cachedOriginal = imageUrlMappings.get(failedCdnUrl);
    if (cachedOriginal) {
        WebPLogger.logInfo(`[Fallback] 캐시된 원본 URL 사용: ${cachedOriginal}`);
        return [cachedOriginal];
    }

    const cdnHost = CDN_HOST;
    const cdnPathPrefix = CDN_PATH_PREFIX;
    const expectedCdnUrlStart = `https://${cdnHost}${cdnPathPrefix}`;

    // 1. 실패한 URL이 예상하는 CDN .webp URL 패턴인지 확인
    if (!failedCdnUrl.startsWith(expectedCdnUrlStart) || !failedCdnUrl.endsWith('.webp')) {
        WebPLogger.logWarn(`[Fallback] URL "${failedCdnUrl}"이 예상 CDN .webp 패턴과 일치하지 않습니다.`);
        return [];
    }

    // 2. CDN URL에서 원본 URL의 캡처 그룹 \1, \2에 해당하는 부분을 추출
    //    CDN URL 구조: https://storage.cloud.google.com/cdn.ecarbon.kr/<원본호스트_캡처그룹1>/<파일명(확장자제외)_캡처그룹2>.webp
    const dynamicPart = failedCdnUrl.substring(expectedCdnUrlStart.length);
    // dynamicPart 예시: "example.com/image_name.webp"

    const parts = dynamicPart.split('/');
    if (parts.length < 2) { // 최소 <호스트부분>/<파일명부분>.webp 형태여야 함
        WebPLogger.logWarn(`[Fallback] CDN URL 경로 "${dynamicPart}"가 예상된 <호스트>/<파일명>.webp 형식이 아닙니다.`);
        return [];
    }

    const filenameWithWebpExt = parts.pop(); // 마지막 요소 "<파일명>.webp" 추출 및 배열에서 제거
    const originalFilenameStem = filenameWithWebpExt.substring(0, filenameWithWebpExt.lastIndexOf('.webp')); // <파일명> (캡처그룹 \2)

    // 남은 부분을 합쳐서 <원본호스트> (캡처그룹 \1) 구성
    // (만약 originalHost에 '/'가 포함될 수 있는 정규식이었다면 parts.join('/')이 의미있지만, [^/]+ 이므로 parts[0]과 동일)
    const originalHost = parts.join('/'); 

    if (!originalHost || !originalFilenameStem) {
        WebPLogger.logWarn(`[Fallback] "${dynamicPart}"에서 원본 호스트 또는 파일명을 파싱할 수 없습니다.`);
        return [];
    }

    // 3. 원본 URL 재구성 시도
    // ASSUMED_ORIGINAL_BASE_PATH와 ASSUMED_ORIGINAL_EXTENSIONS를 사용합니다.
    let basePath = ASSUMED_ORIGINAL_BASE_PATH;
    if (!basePath.endsWith('/')) {
        basePath += '/';
    }
    if (basePath === '/' && originalFilenameStem.startsWith('/')) { // 중복 슬래시 방지
        basePath = '';
    }
    
    const potentialUrls = ASSUMED_ORIGINAL_EXTENSIONS.map(ext => {
        return `https://${originalHost}${basePath}${originalFilenameStem}.${ext}`;
    });

    return potentialUrls;
}

/**
 * 이미지 로딩 에러를 처리하는 함수.
 * @param {Event} event - 에러 이벤트.
 */
function handleImageError(event) {
    const imgElement = event.target;
    
    // 이미 진행 중인 에러 처리가 있으면 중복 처리 방지
    if (imgElement.dataset.fallbackInProgress === 'true') {
        return;
    }
    
    imgElement.dataset.fallbackInProgress = 'true';
    
    const currentTryCount = parseInt(imgElement.dataset.fallbackTryCount || '0');
    const failedUrl = imgElement.src;
    const originalUrl = imgElement.dataset.originalSrc || null;

    // 이미 최대 재시도 횟수를 넘었거나, 폴백 URL을 생성할 수 없으면 중단
    if (currentTryCount >= MAX_RETRY_COUNT) {
        if (imgElement.dataset.fallbackReported !== 'true') {
            WebPLogger.logError(`[Fallback] 이미지(${failedUrl}) 로드 실패 후 모든 폴백 시도 실패.`);
            imgElement.dataset.fallbackReported = 'true';
            
            // 모든 폴백 시도 실패 로깅
            WebPLogger.logFailedImage(failedUrl, originalUrl, 'fallback_failed_all');
        }
        imgElement.dataset.fallbackInProgress = 'false';
        return;
    }
    
    // 원본 URL 복원 시도
    let potentialOriginalUrls = [];
    
    // 1. data-original-src 속성 확인
    if (imgElement.dataset.originalSrc) {
        potentialOriginalUrls.push(imgElement.dataset.originalSrc);
    }
    // 2. 캐시에서 매핑 확인
    else if (imageUrlMappings.has(failedUrl)) {
        potentialOriginalUrls.push(imageUrlMappings.get(failedUrl));
    }
    // 3. 이전에 생성된 URL 목록 확인
    else if (imgElement.dataset.potentialFallbackUrls) {
        potentialOriginalUrls = JSON.parse(imgElement.dataset.potentialFallbackUrls);
    }
    // 4. 새 URL 목록 생성
    else {
        potentialOriginalUrls = reconstructOriginalUrls(failedUrl);
    }
    
    // 최초 오류 발생 시 로깅 (CDN 이미지 로드 실패)
    if (currentTryCount === 0 && failedUrl.includes(CDN_HOST)) {
        WebPLogger.logFailedImage(failedUrl, originalUrl, 'cdn_load_failed');
    }
    
    // 유효한 URL이 없으면 중단
    if (!potentialOriginalUrls || potentialOriginalUrls.length === 0) {
        if (imgElement.dataset.fallbackReported !== 'true') {
            WebPLogger.logError(`[Fallback] 이미지(${failedUrl}) 로드 실패, 원본 URL 재구성 불가.`);
            imgElement.dataset.fallbackReported = 'true';
            
            // 원본 URL 재구성 실패 로깅
            WebPLogger.logFailedImage(failedUrl, originalUrl, 'reconstruction_failed');
        }
        imgElement.dataset.fallbackInProgress = 'false';
        return;
    }
    
    // URL 목록 저장
    imgElement.dataset.potentialFallbackUrls = JSON.stringify(potentialOriginalUrls);
    
    // 다음 시도 URL 결정
    let nextUrl;
    if (currentTryCount < potentialOriginalUrls.length) {
        nextUrl = potentialOriginalUrls[currentTryCount];
    } else {
        // 모든 URL을 시도했지만 currentTryCount < MAX_RETRY_COUNT이면 첫 번째 URL로 다시 시도
        nextUrl = potentialOriginalUrls[0];
    }
    
    WebPLogger.logInfo(`[Fallback] 이미지(${failedUrl}) 로드 실패. 폴백 시도 ${currentTryCount + 1}/${MAX_RETRY_COUNT}: ${nextUrl}`);
    
    // 폴백 시도 로깅
    WebPLogger.logFailedImage(failedUrl, nextUrl, `fallback_attempt_${currentTryCount + 1}`);
    
    // 재시도 카운터 증가
    imgElement.dataset.fallbackTryCount = (currentTryCount + 1).toString();
    
    // 이미지 이벤트 처리 - 성공 또는 실패 시 표시
    const successHandler = () => {
        WebPLogger.logInfo(`[Fallback] 성공: ${nextUrl}`);
        imgElement.dataset.fallbackInProgress = 'false';
        imgElement.removeEventListener('load', successHandler);
        imgElement.removeEventListener('error', errorHandler);
        
        // 폴백 성공 로깅
        WebPLogger.logFailedImage(failedUrl, nextUrl, 'fallback_success');
    };
    
    const errorHandler = () => {
        // 다른 에러 이벤트가 트리거될 것이므로 여기서는 로깅만 함
        WebPLogger.logInfo(`[Fallback] 실패: ${nextUrl}`);
        imgElement.dataset.fallbackInProgress = 'false';
        imgElement.removeEventListener('load', successHandler);
        imgElement.removeEventListener('error', errorHandler);
        
        // 이 URL에 대한 폴백 실패 로깅
        WebPLogger.logFailedImage(failedUrl, nextUrl, `fallback_failed_url_${currentTryCount + 1}`);
    };
    
    // 이벤트 리스너 추가
    imgElement.addEventListener('load', successHandler);
    imgElement.addEventListener('error', errorHandler);
    
    // URL 변경
    imgElement.src = nextUrl;
}

/**
 * 이미지 요소를 처리합니다 - CORS 문제를 피하기 위해 HEAD 요청 없이 바로 CDN URL로 시도
 * @param {HTMLImageElement} imgElement - 이미지 요소
 */
function processImage(imgElement) {
    try {
        // 이미 처리된 이미지인지 확인
        if (imgElement.dataset.webpProcessed === 'true') {
            return;
        }
        
        // 이미지가 완전히 로드되지 않았거나 src가 없는 경우 처리하지 않음
        if (!imgElement.src || imgElement.src === '' || imgElement.src.startsWith('data:')) {
            return;
        }
        
        // src가 javascript:void(0) 또는 about:blank 같은 유효하지 않은 URL인 경우 처리하지 않음
        if (imgElement.src.startsWith('javascript:') || imgElement.src.startsWith('about:')) {
            return;
        }
        
        // 원본 URL 저장
        const originalSrc = imgElement.src;
        
        // 이미 CDN URL인 경우 처리하지 않음
        if (originalSrc.includes(CDN_HOST)) {
            imgElement.dataset.webpProcessed = 'true';
            return;
        }
        
        // CDN 이미지 URL 생성
        const cdnUrl = convertToCdnUrl(originalSrc);
        if (!cdnUrl) {
            imgElement.dataset.webpProcessed = 'true';
            return;
        }
        
        // 원본 URL을 data 속성에 저장
        imgElement.dataset.originalSrc = originalSrc;
        
        // 처리됨으로 표시
        imgElement.dataset.webpProcessed = 'true';
        
        // 이미지 이벤트 핸들러 설정 (성공 또는 실패 시 표시)
        const successHandler = () => {
            WebPLogger.logInfo(`[WebP Extension] CDN 이미지 로드 성공: ${cdnUrl}`);
            imgElement.removeEventListener('load', successHandler);
            
            // 성공적으로 CDN 이미지로 변환된 경우 로깅
            WebPLogger.logFailedImage(cdnUrl, originalSrc, 'cdn_load_success');
        };
        
        imgElement.addEventListener('load', successHandler);
        
        // CDN URL로 직접 변경 (실패 시 handleImageError에서 처리됨)
        WebPLogger.logInfo(`[WebP Extension] CDN WebP 이미지로 변경 시도: ${cdnUrl}`);
        imgElement.src = cdnUrl;
    } catch (error) {
        WebPLogger.logError('[WebP Extension] 이미지 처리 오류:', error);
    }
}

/**
 * 페이지의 모든 이미지를 처리합니다 (새로 추가된 이미지 포함)
 */
function processAllImages() {
    const images = document.querySelectorAll('img:not([data-webp-processed="true"])');
    
    if (images.length > 0) {
        WebPLogger.logInfo(`[WebP Extension] 처리되지 않은 이미지 ${images.length}개 발견, 처리 중...`);
        
        for (const img of images) {
            // 일부 프레임워크는 이미지 로드 전에 src를 비워두고 나중에 설정하므로
            // src가 비어있는 이미지는 나중에 다시 확인하기 위해 건너뜁니다
            if (img.src && img.src !== '' && !img.src.startsWith('data:')) {
                processImage(img);
            }
        }
    }
}

/**
 * lazy-loading 이미지를 감지하기 위한 스크롤 이벤트 핸들러
 */
function handleScroll() {
    // 스크롤 이벤트는 자주 발생하므로 쓰로틀링 적용
    if (!handleScroll.throttleTimer) {
        handleScroll.throttleTimer = setTimeout(() => {
            processAllImages();
            handleScroll.throttleTimer = null;
        }, 200); // 200ms 쓰로틀링
    }
}

/**
 * DOM에 추가된 이미지 요소를 처리합니다.
 * @param {MutationRecord[]} mutations - DOM 변경 레코드
 */
function handleDomMutations(mutations) {
    let hasNewImages = false;
    
    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            // 새로 추가된 노드 처리
            for (const node of mutation.addedNodes) {
                // 이미지 요소인 경우 직접 처리
                if (node.tagName === 'IMG') {
                    hasNewImages = true;
                    processImage(node);
                }
                
                // 자식 요소 중 이미지 탐색
                if (node.querySelectorAll) {
                    const images = node.querySelectorAll('img:not([data-webp-processed="true"])');
                    if (images.length > 0) {
                        hasNewImages = true;
                        for (const img of images) {
                            processImage(img);
                        }
                    }
                }
            }
        } else if (mutation.type === 'attributes' && 
                  mutation.target.tagName === 'IMG' && 
                  mutation.attributeName === 'src' &&
                  !mutation.target.dataset.webpProcessed) {
            // src 속성이 변경된 이미지 요소 처리 (이미 처리된 것은 제외)
            hasNewImages = true;
            processImage(mutation.target);
        }
    }
    
    // 새 이미지가 발견되면 지연 로딩된 다른 이미지도 있을 수 있으므로 전체 검사 트리거
    if (hasNewImages) {
        // 약간의 지연을 두고 한 번 더 검사 (일부 프레임워크는 DOM에 먼저 추가한 후 src 설정)
        setTimeout(processAllImages, 100);
    }
}

// 페이지 로드 시 기존 이미지 처리
function processExistingImages() {
    processAllImages();
    
    // 일부 이미지는 DOM에 추가된 후 src가 설정될 수 있으므로 약간의 지연 후 다시 처리
    setTimeout(processAllImages, 500);
    setTimeout(processAllImages, 1500);
}

// 주기적으로 새 이미지 검사 (lazy loading, 동적 콘텐츠 처리)
const periodicScanInterval = setInterval(processAllImages, PERIODIC_SCAN_INTERVAL);

// 스크롤 이벤트 핸들러 등록 (lazy loading 이미지 감지)
window.addEventListener('scroll', handleScroll, { passive: true });

// DOM 변경 감시 설정 (더 세부적인 옵션 사용)
const observer = new MutationObserver(handleDomMutations);
observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'data-src', 'data-srcset'], // 이미지 로딩 관련 속성 추적
    characterData: false
});

// 이미지 에러에 대한 이벤트 리스너 등록 (캡처 단계 사용)
document.addEventListener('error', function(event) {
    if (event.target.tagName === 'IMG') {
        handleImageError(event);
    }
}, true);

// 페이지 로드 시 기존 이미지 처리
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processExistingImages);
} else {
    processExistingImages();
}

// AJAX 이후 동적으로 로드되는 콘텐츠 처리
window.addEventListener('load', function() {
    // 페이지가 완전히 로드된 후 모든 이미지 재처리
    processAllImages();
    
    // 일부 AJAX 프레임워크에서 사용하는 이벤트 감시
    if (typeof jQuery !== 'undefined') {
        jQuery(document).ajaxComplete(function() {
            setTimeout(processAllImages, 100);
        });
    }
});

// 페이지 가시성 변경 시 (탭 전환 등) 처리
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        processAllImages();
    }
});

WebPLogger.logInfo('[WebP Extension] 이미지 변환 스크립트 로드됨. 현재 도메인:', window.location.hostname);
} // end of else (비제외 도메인에서만 실행)