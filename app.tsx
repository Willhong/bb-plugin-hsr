import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { definePluginApp, useRpc } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './ui-contract.js';
import { visibleRows, type UsageFilter, type UsageReport, type UsageSort } from './usage-view.js';
import { withDeadline } from './request-deadline.js';
import './app.css';

const number = new Intl.NumberFormat('ko-KR');
const percent = (n: number) => n > 0 && n < 0.1 ? '<0.1%' : `${n.toFixed(1)}%`;
function date(value: string | null) {
  if (!value) return '기록 없음';
  const d = new Date(value);
  return Number.isNaN(+d) ? '시각 미확인' : new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function UsagePanel() {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UsageFilter>('all');
  const [sort, setSort] = useState<UsageSort>('observations');
  const active = useRef(false);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    if (active.current) setLoading(true);
    try {
      const result = await withDeadline(rpc.call('usage', {}), 10000);
      if (active.current) { setData(result); setError(null); }
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      pending.current = false;
      if (active.current) setLoading(false);
    }
  }, [rpc]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { active.current = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  const rows = useMemo(() => data ? visibleRows(data, query, filter, sort) : [], [data, query, filter, sort]);
  const status = data?.usageStatus === 'cached' ? '저장된 기록' : data?.usageStatus === 'ready' ? '수집 완료' : data?.usageStatus === 'collecting' ? '과거 기록 수집 중' : '일부 기록 수집 미완료';

  return <section className="hsr-usage" aria-label="HSR 스킬 사용 현황">
    <div className="hsr-usage__body">
      <div className="hsr-usage__intro">
        <div>
          <p className="hsr-usage__lead">어떤 스킬을 얼마나 불러왔는지 확인하세요.</p>
          <p className="hsr-usage__muted">HSR에 담긴 스킬 · 전체 수집 기간 · 30초마다 갱신</p>
        </div>
        <button className="hsr-usage__button" onClick={() => void refresh()} disabled={loading}>{loading ? '불러오는 중…' : '새로고침'}</button>
      </div>
      {error && <div className="hsr-usage__notice" role="alert">
        <strong>사용 기록을 불러오지 못했습니다.</strong>
        <p>{data ? '아래에는 마지막으로 확인한 값이 남아 있습니다. 새로고침으로 다시 시도해 주세요.' : '새로고침으로 다시 시도해 주세요. 처음 사용한다면 BB 플러그인 설정에서 HSR 호스트와 경로를 확인해 주세요.'}</p>
        <details><summary>오류 상세</summary><p className="hsr-usage__error-detail">{error}</p></details>
      </div>}
      {!data && !error && <div className="hsr-usage__empty" role="status">스킬과 사용 기록을 불러오는 중입니다.</div>}
      {data && <>
        <div className="hsr-usage__overview">
          <p><strong>{number.format(data.observed)} / {number.format(data.total)}</strong>개 스킬에서 기록을 확인했습니다.</p>
          <p className="hsr-usage__muted">명시적 요청 <b>{number.format(data.requests)}</b>회 <span aria-hidden="true">·</span> 본문 로드 <b>{number.format(data.loads)}</b>회 <span aria-hidden="true">·</span> 적용 보고 <b>{number.format(data.applications)}</b>회</p>
        </div>
        <div className="hsr-usage__toolbar">
          <label className="hsr-usage__search">스킬 검색<input type="search" placeholder="이름 또는 설명으로 검색" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <label>기록 유형<select value={filter} onChange={e => setFilter(e.target.value as UsageFilter)}><option value="all">전체 스킬</option><option value="requested">직접 요청 있음</option><option value="loaded">본문 로드 있음</option><option value="applied">적용 기록 있음</option><option value="unobserved">관측 기록 없음</option></select></label>
          <label>정렬<select value={sort} onChange={e => setSort(e.target.value as UsageSort)}><option value="observations">관측 많은 순</option><option value="requests">요청 많은 순</option><option value="applications">적용 보고 많은 순</option><option value="recent">최근 기록 순</option><option value="name">이름순</option></select></label>
        </div>
        <div className="hsr-usage__caption"><span aria-live="polite">{rows.length}개 스킬</span><span>{error ? '이전 조회 결과' : status} · {date(data.fetchedAt)} 확인</span></div>
        {!['ready', 'cached'].includes(data.usageStatus) && <p className="hsr-usage__notice" role="status">{data.usageStatus === 'collecting' ? '과거 기록을 나누어 수집하고 있습니다. 수집이 진행되면 횟수와 비중이 달라질 수 있습니다.' : '일부 원본을 수집하지 못했습니다. 표시된 값은 현재까지 확인한 기록입니다.'}</p>}
        {data.total === 0 ? <div className="hsr-usage__empty">HSR에 담긴 스킬이 없습니다. 스킬을 등록한 뒤 새로고침해 주세요.</div>
          : rows.length === 0 ? <div className="hsr-usage__empty"><p>조건에 맞는 스킬이 없습니다.</p><button className="hsr-usage__button" onClick={() => { setQuery(''); setFilter('all'); }}>검색 조건 초기화</button></div>
          : <table className="hsr-usage__table">
            <caption className="hsr-usage__sr-only">등록된 HSR 스킬별 본문 로드, 적용 보고, 전체 관측 기록에서 차지하는 비중</caption>
            <colgroup><col className="hsr-usage__name-col" /><col /><col /><col /><col className="hsr-usage__share-col" /><col className="hsr-usage__date-col" /></colgroup>
            <thead><tr><th scope="col">스킬</th><th scope="col">명시적 요청</th><th scope="col">본문 로드</th><th scope="col">적용 보고</th><th scope="col" className="hsr-usage__share-cell">관측 비중</th><th scope="col" className="hsr-usage__date">최근 기록</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.name}>
              <th scope="row"><details><summary>{row.name}</summary><p>{row.description}</p></details><span className="hsr-usage__mobile-date">{date(row.lastUsed)} · 비중 {percent(row.share)}</span></th>
              <td>{number.format(row.requests)}</td><td>{number.format(row.loads)}</td><td>{number.format(row.applications)}</td>
              <td className="hsr-usage__share-cell"><div className="hsr-usage__share"><span>{percent(row.share)}</span><meter min={0} max={100} value={row.share} aria-label={`${row.name} 관측 비중`} /></div></td>
              <td className="hsr-usage__date">{date(row.lastUsed)}</td>
            </tr>)}</tbody>
          </table>}
        <footer className="hsr-usage__footnote"><p>관측 비중 = 해당 스킬의 요청·로드·적용 보고 ÷ 등록 스킬 전체의 요청·로드·적용 보고. 검색 조건을 바꿔도 분모는 유지됩니다.</p><p>명시적 요청은 사용자가 스킬을 직접 지정한 횟수이고, 적용 보고는 에이전트가 별도 도구로 보고한 횟수입니다. 적용 보고가 0이어도 스킬을 사용하지 않았다는 뜻은 아닙니다.</p></footer>
      </>}
    </div>
  </section>;
}

export default definePluginApp(app => {
  app.slots.navPanel({ id: 'usage', path: 'usage', title: '스킬 사용 현황', icon: 'Layers', component: UsagePanel });
});
