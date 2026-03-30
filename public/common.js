// ============================================================================
// [공통 모듈] common.js
// 카카오 주소 검색 및 건축물대장 API 공통 유틸리티
// ============================================================================

const JUSO_API_KEY = "U01TX0FVVEgyMDI1MTAxMDExNDkyNjExNjMxMTY=";
const BUILDING_API_KEY = "a80d7fbe3842d32f845889a352543d38fde0cf1625508e615c3fbf5705d36578";

/**
 * 1. 도로명주소 API로 지번 정보(행정코드, 번지) 반환
 */
async function getAddressInfo(keyword) {
    const url = `https://www.juso.go.kr/addrlink/addrLinkApi.do?confmKey=${JUSO_API_KEY}&currentPage=1&countPerPage=5&keyword=${encodeURIComponent(keyword)}&resultType=json`;
    const res = await fetch(url);
    const data = await res.json();
    const common = data.results?.common;
    if (common?.errorCode !== '0') throw new Error(common?.errorMessage || '주소 API 오류');
    const juso = data.results?.juso?.[0];
    if (!juso) throw new Error('검색된 주소가 없습니다.');
    const admCd = juso.admCd || '';
    return {
        sigunguCd: admCd.substring(0, 5),
        bjdongCd: admCd.substring(5),
        bun: juso.lnbrMnnm || '',
        ji: juso.lnbrSlno || '0',
        roadAddr: juso.roadAddr,
        jibunAddr: juso.jibunAddr
    };
}

/**
 * 2. 건축물대장 API를 호출하여 건물 면적 및 용도 정보 반환
 */
async function fetchBuildingRegister(info) {
    const { sigunguCd, bjdongCd, bun, ji } = info;
    const paddedBun = bun.padStart(4, '0');
    const paddedJi = ji.padStart(4, '0');
    // HTTPS 및 XML 응답을 지원하는 Hub EndPoint 사용
    const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=${BUILDING_API_KEY}&sigunguCd=${sigunguCd}&bjdongCd=${bjdongCd}&bun=${paddedBun}&ji=${paddedJi}&numOfRows=100&pageNo=1`;

    const res = await fetch(url);
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const totalCount = parseInt(xmlDoc.getElementsByTagName('totalCount')[0]?.textContent || '0');
    if (totalCount === 0) throw new Error('해당 지번에 건축물대장 정보가 없습니다.');

    const items = xmlDoc.getElementsByTagName('item');
    const arr = Array.from(items);

    // 주건축물(mainAtchGbCd === '0') 우선 선택
    let target = arr.find(item => {
        const gbCd = item.getElementsByTagName('mainAtchGbCd')[0]?.textContent;
        return gbCd === '0';
    });
    if (!target) target = items[0];

    const getVal = (tag) => target.getElementsByTagName(tag)[0]?.textContent?.trim() || '';

    // 기존 app.js에서 사용하던 공통 필드 객체 형태로 반환
    return {
        totArea: getVal('totArea'),
        mainPurpsCdNm: getVal('mainPurpsCdNm'),
        platArea: getVal('platArea'),
        archArea: getVal('archArea'),
        useAprDay: getVal('useAprDay'),
        bldNm: getVal('bldNm'),
        mainAtchGbCdNm: getVal('mainAtchGbCdNm')
    };
}

/**
 * 3. 카카오 우편번호 서비스 위젯을 컨테이너에 임베드 (index.html 연동)
 */
function initKakaoPostcode(embedContainerId, onCompleteCallback) {
    const el = document.getElementById(embedContainerId);
    if (!el) {
        console.warn(`[Kakao] 컨테이너 요소(#${embedContainerId})를 찾을 수 없습니다.`);
        return;
    }

    if (!window.daum || !window.daum.Postcode) {
        console.warn("[Kakao] Postcode SDK 미준비 상태");
        return;
    }

    // 기존 내용 초기화
    el.innerHTML = '';

    function doEmbed() {
        // 컨테이너가 DOM에 렌더링되어 실제 크기가 잡혀있는지 확인
        if (el.offsetWidth === 0 || el.offsetHeight === 0) {
            // 크기가 아직 0이면 다음 애니메이션 프레임에서 재시도
            requestAnimationFrame(doEmbed);
            return;
        }

        new daum.Postcode({
            oncomplete: function (data) {
                let addr = data.roadAddress || data.jibunAddress;
                let extraAddr = '';

                if (data.bname !== '' && /[동로가]$/g.test(data.bname)) extraAddr += data.bname;
                if (data.buildingName !== '' && data.apartment === 'Y') {
                    extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
                }
                if (extraAddr !== '') addr += ` (${extraAddr})`;

                // 콜백 호출 (addr, buildingName, 원본 data 전달)
                if (typeof onCompleteCallback === 'function') {
                    onCompleteCallback(addr, data.buildingName, data);
                }
            },
            width: '100%',
            height: '100%'
        }).embed(el);
    }

    // requestAnimationFrame으로 레이아웃 완료 후 embed 실행
    requestAnimationFrame(doEmbed);
}

// Global Export
window.wkCommon = {
    getAddressInfo,
    fetchBuildingRegister,
    initKakaoPostcode
};
