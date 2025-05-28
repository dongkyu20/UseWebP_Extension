// logger.js - WebP 확장 프로그램 로깅 모듈

// 로깅 설정
const LOGGING_ENABLED = true; // 로깅 활성화 여부
const LOG_SERVER_URL = 'https://log.greenee.kr/log'; // 로그 서버 URL
const LOG_BATCH_SIZE = 20; // 한번에 전송할 로그 수
const LOG_SEND_INTERVAL = 60000; // 로그 전송 간격 (밀리초) - 1분
const LOG_LEVEL = 'info'; // 로그 레벨 (debug, info, warn, error)

// 로그 레벨 정의
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// 실패한 이미지 URL 로그를 저장할 배열
const failedImageLogs = [];

// 이미 로깅된 URL을 추적하는 Set (중복 로그 방지)
const loggedUrls = new Set();

/**
 * 기본 로깅 함수
 * @param {string} level - 로그 레벨
 * @param {string} message - 로그 메시지
 * @param {any} data - 추가 데이터 (선택 사항)
 */
function log(level, message, data) {
  if (!LOGGING_ENABLED) return;
  
  // 설정된 로그 레벨보다 낮은 레벨은 무시
  if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return;
  
  // 콘솔 로깅
  const timestamp = new Date().toISOString();
  const prefix = `[WebP Extension][${level.toUpperCase()}]`;
  
  if (data) {
    console[level](`${prefix} ${timestamp} - ${message}`, data);
  } else {
    console[level](`${prefix} ${timestamp} - ${message}`);
  }
}

/**
 * 로그 데이터를 서버로 전송합니다.
 * @param {Array} logs - 전송할 로그 데이터 배열
 * @returns {Promise<boolean>} 전송 성공 여부
 */
async function sendLogsToServer(logs) {
  if (!LOGGING_ENABLED || !logs || logs.length === 0) {
    return false;
  }
  
  try {
    // 각 로그 항목을 개별적으로 전송
    let successCount = 0;
    
    for (const logEntry of logs) {
      const response = await fetch(LOG_SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logEntry)
      });
      
      if (response.ok) {
        successCount++;
      } else {
        log('warn', `로그 전송 실패: ${response.status} ${response.statusText}`);
      }
    }
    
    if (successCount === logs.length) {
      log('info', `${logs.length}개의 로그 전송 성공`);
      return true;
    } else {
      log('warn', `일부 로그 전송 실패: ${successCount}/${logs.length} 성공`);
      return successCount > 0;
    }
  } catch (error) {
    log('error', '로그 전송 중 오류 발생:', error);
    return false;
  }
}

/**
 * 실패한 이미지 URL을 로그에 추가합니다.
 * @param {string} cdnUrl - 실패한 CDN URL
 * @param {string} originalUrl - 원본 URL (있는 경우)
 * @param {string} status - 상태 (예: 'cdn_not_found', 'fallback_success', 'fallback_failed')
 */
function logFailedImage(cdnUrl, originalUrl, status) {
  if (!LOGGING_ENABLED) return;
  
  // 이미 로깅된 URL인지 확인 (중복 방지)
  const logKey = `${cdnUrl}|${status}`;
  if (loggedUrls.has(logKey)) return;
  
  // CDN URL 정보 추출
  const cdnUrlDetails = parseUrlDetails(cdnUrl);
  
  // 원본 URL 정보 추출 (originalUrl이 제공된 경우)
  // originalUrl이 없으면 현재 페이지 URL에서 도메인 추출
  let originalUrlDetails = { domain: '', original_filename: '', filename_base: '', origin_url: '', original_path_query: '' };
  
  if (originalUrl) {
    originalUrlDetails = parseUrlDetails(originalUrl);
  } else {
    // originalUrl이 없는 경우 현재 페이지 URL에서 도메인 추출
    try {
      const currentUrl = new URL(window.location.href);
      originalUrlDetails.domain = currentUrl.hostname;
    } catch (e) {
      console.error('[WebP Extension] 현재 페이지 URL 파싱 오류:', e);
    }
  }
  
  let level = 'INFO';
  let message = '';

  switch (status) {
    case 'cdn_not_found':
      level = 'WARN';
      message = `CDN image not found. Original: ${originalUrl || 'unknown'}. Page: ${window.location.href}`;
      break;
    case 'cdn_load_success':
      level = 'SUCCESS';
      message = `CDN WebP image loaded successfully. Original: ${originalUrl || 'unknown'}. Page: ${window.location.href}`;
      break;
    case 'fallback_success':
      level = 'SUCCESS'; // SUCCESS로 변경하여 서버에서 리덕션 처리가 진행되도록 함
      message = `Fallback successful. Original: ${originalUrl || 'unknown'}. Page: ${window.location.href}`;
      break;
    case 'fallback_failed':
      level = 'ERROR';
      message = `Fallback failed. Original: ${originalUrl || 'unknown'}. Page: ${window.location.href}`;
      break;
    default:
      level = 'INFO';
      message = `Image event: ${status}. Original: ${originalUrl || 'unknown'}. Page: ${window.location.href}`;
  }
  
  // 로그 데이터 생성 (LogEntry 형식)
  const logEntry = {
    level: level,
    message: message,
    // 원본 웹페이지 URL 정보 사용
    origin_url: originalUrlDetails.origin_url || cdnUrlDetails.origin_url, 
    domain: originalUrlDetails.domain || cdnUrlDetails.domain,         
    original_filename: originalUrlDetails.original_filename || cdnUrlDetails.original_filename,
    filename_base: originalUrlDetails.filename_base || cdnUrlDetails.filename_base,
    original_path_query: originalUrlDetails.original_path_query || cdnUrlDetails.original_path_query,
    timestamp: new Date().toISOString(),
  };
  
  // 로그 배열에 추가
  failedImageLogs.push(logEntry);
  loggedUrls.add(logKey);
  
  // 로그 배열이 일정 크기에 도달하면 즉시 전송
  if (failedImageLogs.length >= LOG_BATCH_SIZE) {
    sendPendingLogs();
  }
}

// Helper function to extract details from a URL string
function parseUrlDetails(urlString) {
  try {
    const url = new URL(urlString);
    const pathname = url.pathname;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    
    let filenameBase = filename;
    const lastDotIndex = filename.lastIndexOf('.');
    // Ensure dot is not the first char and exists to correctly extract base name
    if (lastDotIndex > 0) { 
      filenameBase = filename.substring(0, lastDotIndex);
    }

    return {
      domain: url.hostname,
      original_filename: filename,
      filename_base: filenameBase,
      origin_url: pathname,  // 경로 부분만 포함
      original_path_query: url.search,  // 쿼리 파라미터만 포함 (?key=value&key2=value2 형식 또는 빈 문자열)
    };
  } catch (e) {
    // If URL parsing fails (e.g. for data URIs, or if urlString is not a valid URL)
    // Return empty strings for structured fields, keep original string for path_query for context
    return {
      domain: '',
      original_filename: '',
      filename_base: '',
      origin_url: '',
      original_path_query: '',
    };
  }
}

/**
 * 대기 중인 모든 로그를 서버로 전송합니다.
 */
async function sendPendingLogs() {
  if (!LOGGING_ENABLED || failedImageLogs.length === 0) return;
  
  // 로그 배열 복사 후 초기화
  const logsToSend = [...failedImageLogs];
  failedImageLogs.length = 0;
  
  // 서버로 전송
  const success = await sendLogsToServer(logsToSend);
  
  // 실패한 경우 다시 로그 배열에 추가
  if (!success) {
    failedImageLogs.push(...logsToSend);
  }
}

/**
 * 정보 레벨 로그
 * @param {string} message - 로그 메시지
 * @param {any} data - 추가 데이터 (선택 사항)
 */
function logInfo(message, data) {
  log('info', message, data);
}

/**
 * 경고 레벨 로그
 * @param {string} message - 로그 메시지
 * @param {any} data - 추가 데이터 (선택 사항)
 */
function logWarn(message, data) {
  log('warn', message, data);
}

/**
 * 오류 레벨 로그
 * @param {string} message - 로그 메시지
 * @param {any} data - 추가 데이터 (선택 사항)
 */
function logError(message, data) {
  log('error', message, data);
}

/**
 * 디버그 레벨 로그
 * @param {string} message - 로그 메시지
 * @param {any} data - 추가 데이터 (선택 사항)
 */
function logDebug(message, data) {
  log('debug', message, data);
}

// 주기적으로 로그 전송
setInterval(sendPendingLogs, LOG_SEND_INTERVAL);

// 페이지 언로드 시 남은 로그 전송 시도
window.addEventListener('beforeunload', function() {
  if (failedImageLogs.length > 0) {
    // 각 로그 항목을 개별적으로 전송 시도
    for (const logEntry of failedImageLogs) {
      navigator.sendBeacon(LOG_SERVER_URL, JSON.stringify(logEntry));
    }
  }
});

// 모듈 내보내기
window.WebPLogger = {
  logFailedImage,
  sendPendingLogs,
  logInfo,
  logWarn,
  logError,
  logDebug
};
