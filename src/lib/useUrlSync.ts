/**
 * URL ⇔ useAppStore を双方向で同期する hook。
 *
 *  - 初回マウント: URL → store (リロード/ディープリンク復元)
 *  - store 変更時: store → URL (history.pushState で履歴に積む)
 *  - popstate(戻る/進む): URL → store
 *
 * 無限ループ防止: 既に URL と store が一致してたら何もしない (navStatesEqual)
 */
import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import type { AppNavState } from '../types';
import { navToUrl, urlToNav, navStatesEqual } from './urlSync';

function pickNavState(): AppNavState {
  const s = useAppStore.getState();
  return {
    view: s.view,
    projectId: s.projectId,
    massCaseId: s.massCaseId,
    sizingCaseId: s.sizingCaseId,
    analysisCaseId: s.analysisCaseId,
    analysisService: s.analysisService,
    pluginCaseId: s.pluginCaseId,
    analysisFlowId: s.analysisFlowId,
    vehicleUnitId: s.vehicleUnitId,
    applicationId: s.applicationId,
  };
}

export function useUrlSync(): void {
  const initialized = useRef(false);

  // 初回: URL を読んで store に反映
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fromUrl = urlToNav(window.location.pathname, window.location.search);
    const current = pickNavState();
    if (!navStatesEqual(fromUrl, current)) {
      useAppStore.getState().navigate(fromUrl.view, {
        projectId: fromUrl.projectId,
        massCaseId: fromUrl.massCaseId,
        sizingCaseId: fromUrl.sizingCaseId,
        analysisCaseId: fromUrl.analysisCaseId,
        analysisService: fromUrl.analysisService,
        pluginCaseId: fromUrl.pluginCaseId,
        analysisFlowId: fromUrl.analysisFlowId,
        vehicleUnitId: fromUrl.vehicleUnitId,
        applicationId: fromUrl.applicationId,
      });
    }
  }, []);

  // popstate: ブラウザ戻る/進む
  useEffect(() => {
    const onPop = () => {
      const fromUrl = urlToNav(window.location.pathname, window.location.search);
      const current = pickNavState();
      if (!navStatesEqual(fromUrl, current)) {
        useAppStore.getState().navigate(fromUrl.view, {
          projectId: fromUrl.projectId,
          massCaseId: fromUrl.massCaseId,
          sizingCaseId: fromUrl.sizingCaseId,
          analysisCaseId: fromUrl.analysisCaseId,
          analysisService: fromUrl.analysisService,
          pluginCaseId: fromUrl.pluginCaseId,
          analysisFlowId: fromUrl.analysisFlowId,
          vehicleUnitId: fromUrl.vehicleUnitId,
          applicationId: fromUrl.applicationId,
        });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // store 変更: history に push (URL が現在と異なる場合のみ)
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      const nav: AppNavState = {
        view: state.view,
        projectId: state.projectId,
        massCaseId: state.massCaseId,
        sizingCaseId: state.sizingCaseId,
        analysisCaseId: state.analysisCaseId,
        analysisService: state.analysisService,
        pluginCaseId: state.pluginCaseId,
        analysisFlowId: state.analysisFlowId,
        vehicleUnitId: state.vehicleUnitId,
        applicationId: state.applicationId,
      };
      const target = navToUrl(nav);
      const current = window.location.pathname + window.location.search;
      if (target !== current) {
        window.history.pushState(null, '', target);
      }
    });
    return () => unsub();
  }, []);
}
