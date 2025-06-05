// logger.js - WebP 확장 프로그램 로깅 모듈

// 로깅 설정
const LOGGING_ENABLED = true; // 로깅 활성화 여부
const LOG_SERVER_URL = 'https://log.greenee.kr/log'; // 로그 서버 URL
const LOG_BATCH_SIZE = 5; // 한번에 전송할 로그 수
const LOG_SEND_INTERVAL = 5000; // 로그 전송 간격 (밀리초) - 5초
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
}

/**
 * URL 문자열에서 세부 정보를 추출하는 헬퍼 함수
 * @param {string} urlString - URL 문자열
 * @returns {Object} 추출된 URL 세부 정보
 */
function parseUrlDetails(urlString) {
  try {
    const url = new URL(urlString);
    const pathname = url.pathname;
    
    // filename 추출 로직
    let filename = '';
    
    // 전체 URL 문자열 (쿼리 포함)
    const fullUrl = url.pathname + url.search;
    
    // 이미지 확장자 패턴 확인 (.jpg, .jpeg, .png로 끝나는 부분 찾기)
    const imageExtPattern = /\.(jpe?g|png)(?=[&?#]|$)/i;
    const extMatch = fullUrl.match(imageExtPattern);
    
    if (extMatch) {
      // 확장자가 발견된 위치
      const extIndex = extMatch.index;
      const extLength = extMatch[0].length;
      const endPos = extIndex + extLength;
      
      // 확장자 직전까지의 텍스트
      const beforeExt = fullUrl.substring(0, extIndex);
      
      // 확장자 직전 텍스트에서 역방향으로 '=' 또는 '&' 찾기
      let startPos = beforeExt.lastIndexOf('=');
      if (startPos === -1) {
        // '='가 없으면 '&'도 확인
        startPos = beforeExt.lastIndexOf('&');
        if (startPos === -1) {
          startPos = beforeExt.lastIndexOf('#');
          if (startPos === -1) {
            startPos = beforeExt.lastIndexOf('/');
          }
        }
      }
      
      // 구분자 다음 위치부터 (구분자가 없으면 0부터) 확장자 끝까지 추출
      filename = fullUrl.substring(startPos + 1, endPos);
    } else {
      // 이미지 확장자를 찾지 못한 경우 기본 방식 사용
      filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    }
    
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
      origin_url: url.pathname + url.search, // 전체 URL 포함
      original_path_query: url.search, // '/'가 포함된 경우 빈 문자열 반환
    };
  } catch (e) {
    // URL 파싱 실패 시 (예: 데이터 URI 또는 유효하지 않은 URL)
    console.error('[WebP Extension] URL 파싱 오류:', e, urlString);
    // 구조화된 필드에 빈 문자열 반환, 컨텍스트를 위해 원본 문자열 유지
    return {
      domain: '',
      original_filename: '',
      filename_base: '',
      origin_url: url.pathname || '',
      original_path_query: '',
    };
  }
}

/**
 * 로그 엔트리 생성 함수
 * @param {string} level - 로그 레벨
 * @param {string} message - 로그 메시지
 * @param {string} originalUrl - 원본 URL
 * @param {string} cdnUrl - CDN URL (선택 사항)
 * @param {string} status - 상태 코드 (선택 사항)
 * @returns {Object} 로그 엔트리 객체
 */
function createLogEntry(level, message, originalUrl, cdnUrl = '', status = '') {
  const timestamp = new Date().toISOString();
  
  // URL 세부 정보 추출
  const originalUrlDetails = originalUrl ? parseUrlDetails(originalUrl) : {
    domain: '',
    original_filename: '',
    filename_base: '',
    origin_url: '',
    original_path_query: '',
  };
  
  // CDN URL이 제공된 경우 해당 세부 정보도 추출
  const cdnUrlDetails = cdnUrl ? parseUrlDetails(cdnUrl) : {
    domain: '',
    original_filename: '',
    filename_base: '',
    origin_url: '',
    original_path_query: '',
  };
  
  // 로그 엔트리 생성 (서버에서 기대하는 구조에 맞춤)
  return {
    level: level || 'INFO',
    message: message || '',
    origin_url: originalUrlDetails.origin_url || cdnUrlDetails.origin_url || '',
    domain: originalUrlDetails.domain || cdnUrlDetails.domain || '',
    original_filename: originalUrlDetails.original_filename || cdnUrlDetails.original_filename || '',
    filename_base: originalUrlDetails.filename_base || cdnUrlDetails.filename_base || '',
    original_path_query: originalUrlDetails.original_path_query || cdnUrlDetails.original_path_query || '',
    timestamp: timestamp,
    url: window.location.href, // 현재 페이지 URL
    status: status // 상태 정보
  };
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
      level = 'FALLBACK'; 
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
  
  // 로그 엔트리 생성
  const logEntry = createLogEntry(level, message, originalUrl, cdnUrl, status);
  
  // 로그 배열에 추가
  failedImageLogs.push(logEntry);
  loggedUrls.add(logKey);
  
  // 로그 배열이 일정 크기에 도달하면 즉시 전송
  if (failedImageLogs.length >= LOG_BATCH_SIZE) {
    sendPendingLogs();
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
      // 필수 필드가 누락되었는지 확인
      const requiredFields = ['level', 'message', 'origin_url', 'domain', 'timestamp'];
      const missingFields = requiredFields.filter(field => !logEntry[field]);
      
      if (missingFields.length > 0) {
        console.warn(`필수 필드 누락됨: ${missingFields.join(', ')}`);
        // 누락된 필드가 있으면 기본값 설정
        missingFields.forEach(field => {
          switch(field) {
            case 'level':
              logEntry.level = 'INFO';
              break;
            case 'message':
              logEntry.message = 'No message provided';
              break;
            case 'origin_url':
              logEntry.origin_url = window.location.href;
              break;
            case 'domain':
              logEntry.domain = window.location.hostname;
              break;
            case 'timestamp':
              logEntry.timestamp = new Date().toISOString();
              break;
          }
        });
      }
      
      // 전송 전 최종 확인
      console.log('전송할 로그 데이터:', JSON.stringify(logEntry));
      
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
        // 응답 내용도 확인
        try {
          const errorText = await response.text();
          console.error('서버 응답:', errorText);
        } catch (e) {
          console.error('응답 내용을 읽을 수 없음');
        }
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
  
  // 간단한 정보 로그는 서버로 전송하지 않음
  // 필요하다면 여기에 서버 전송 코드 추가
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
  logDebug,
  createLogEntry, // 추가: 로그 엔트리 생성 함수 외부 노출
  parseUrlDetails // 추가: URL 세부 정보 추출 함수 외부 노출
};
