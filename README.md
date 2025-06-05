# UseWebP_Extension
## Beta Version
### 주요 기능

- 이미지 로드 실패 시 WebP 이미지로 자동 변환
- 다양한 이미지 URL 패턴 지원
- 상세한 로깅 시스템 구현
- 페이지 언로드 시에도 로그 데이터 보존 (navigator.sendBeacon 활용)

### 설치 및 실행 방법

1. 이 저장소를 클론하거나 다운로드합니다.
2. Chrome 브라우저에서 `chrome://extensions/` 페이지에 접속합니다.
3. 우측 상단의 **개발자 모드**를 반드시 활성화합니다.
4. **압축해제된 확장 프로그램 로드** 버튼을 클릭합니다.
5. 다운로드한 확장 프로그램 폴더를 선택합니다.
6. 확장 프로그램이 활성화되면 웹페이지에서 자동으로 이미지 폴백 기능이 작동합니다.

### 설정 및 커스터마이징

확장 프로그램의 동작을 수정하려면 다음 파일을 편집하세요:

- `manifest.json`: 확장 프로그램의 기본 설정
- `content_fallback.js`: 이미지 폴백 로직
- `logger.js`: 로깅 시스템 설정

### 로그 서버 설정

로그 데이터는 `logger.js`에 정의된 URL로 전송됩니다. 기본값은 다음과 같습니다:
```javascript
const LOG_SERVER_URL = '[https://log.greenee.kr/log';](https://log.greenee.kr/log';)


### 추후 개발 예정

- 사용자 ID 저장, 절약한 용량 기록 및 차트화
- 사용자간 비교 기능