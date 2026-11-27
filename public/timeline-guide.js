// #7 타임라인 올리기 안내 시트. Google 지도 타임라인은 휴대폰에만 저장돼서 웹(google.com/maps/timeline)에서는 기록을 볼 수 없다.
// 그래서 누르자마자 파일을 고르게 하지 않고, 기기별로 내보내는 방법을 보이고 'Google 지도 열기'와 '내보낸 파일 고르기' 중에서 고르게 한다.
// 단계와 메뉴 이름은 Google 지도 고객센터 「타임라인 관리」(answer 6258979, iPhone·Android 탭)를 따른다
import { ICON_EXTERNAL } from './ui.js';

// 휴대폰에서 누르면 Google 지도 앱이 열린다(고객센터가 안내하는 타임라인 주소)
export const TIMELINE_URL = 'https://www.google.com/maps/timeline';

// iPadOS Safari는 Mac처럼 보여서 터치 지점 수로 가린다. 어느 쪽도 아니면 컴퓨터(타임라인이 없는 기기)
export function guessOs(ua = '', touchPoints = 0) {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'computer';
}

// iPhone은 Google 지도 앱 설정에, Android는 지도 앱이 아니라 휴대폰 설정 앱에 내보내기가 있다
const STEPS = {
  ios: [
    'In the <b>Google Maps app</b>, tap your profile photo and open <b>Settings</b>',
    'Under <b>Personal content</b> location settings, tap <b>Export Timeline data</b>',
    '<b>Save to Files</b>, then choose <b class="file">location-history.json</b> here',
  ],
  android: [
    'In the phone <b>Settings app</b>, go to <b>Location</b> › <b>Location services</b> › <b>Timeline</b>',
    'Tap <b>Export Timeline data</b> › <b>Continue</b> and choose where to save',
    'When <b>Export complete</b> appears, choose that file here',
  ],
};

// os: 보여 줄 단계('ios'|'android'), phone: 이 기기에 Google 지도 앱이 있을 수 있는지(컴퓨터면 false라 지도 링크를 두지 않는다),
// sample: 체험 데모처럼 내 기록 대신 샘플 타임라인을 쓰게 할지(그때는 샘플이 주 버튼이다)
export function guideHtml({ os = 'ios', phone = true, sample = false } = {}) {
  const tab = os === 'android' ? 'android' : 'ios';
  const seg = `<div class="seg" role="radiogroup" aria-label="My phone" data-seg="tl-os"><span class="seg-thumb"></span>
    ${[['ios', 'iPhone'], ['android', 'Android']].map(([id, label]) => `<button type="button" role="radio" aria-checked="${id === tab}" data-action="tl-os" data-id="${id}">${label}</button>`).join('')}</div>`;
  const open = phone ? `<a class="btn secondary" href="${TIMELINE_URL}" target="_blank" rel="noopener">Open Google Maps${ICON_EXTERNAL}</a>` : '';
  return `<p class="guide-lead">Export your Google Maps history from your phone and choose the file. It is read only on this device.</p>
    ${seg}
    <ol class="steps">${STEPS[tab].map((s) => `<li><span>${s}</span></li>`).join('')}</ol>
    ${phone ? '' : '<p class="guide-note">Timeline data lives only on your phone. Move the exported file to this computer, then choose it.</p>'}
    ${sample ? '<div class="guide-actions"><button type="button" class="btn" data-action="timeline-sample">Try with a sample timeline</button></div><p class="guide-note">This demo reads a sample history, in which you left the second-round bar early, instead of your own.</p>' : ''}
    <div class="guide-actions"><button type="button" class="btn${sample ? ' secondary' : ''}" data-action="timeline-file">Choose exported file</button>${open}</div>`;
}
