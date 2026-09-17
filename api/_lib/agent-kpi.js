// Indicateurs affichés dans le portail agent (répartition par type EDL,
// meublé/nu, typologie) à partir des missions déjà filtrées pour un agent
// donné (voir agent-missions.js). Logique de catégorisation reprise à
// l'identique de extranet-app.html (categorieEdl/statTypologie, déjà
// utilisées pour les statistiques côté agence), pour rester cohérente.
export function categorieEdl(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('sortant') && t.includes('entrant')) return 'simultane';
  if (t.includes('sortant')) return 'sortant';
  if (t.includes('entrant')) return 'entrant';
  return 'autre';
}

// Typologie T1 à T7+ : accepte T3 et F3, rattache le studio au T1 — même
// convention que statTypologie() dans js/app-missions.js.
export function statTypologie(bienTypo) {
  const v = String(bienTypo || '').trim().toLowerCase();
  if (!v) return 'Non renseignée';
  if (v.includes('studio')) return 'T1';
  const found = v.match(/[tf]\s*(\d+)/);
  if (found) {
    const n = parseInt(found[1], 10);
    if (n >= 7) return 'T7+';
    if (n >= 1) return 'T' + n;
  }
  return 'Non renseignée';
}

export function calculerKpiAgent(missions) {
  const kpi = {
    total: missions.length,
    parCategorie: { entrant: 0, sortant: 0, simultane: 0, autre: 0 },
    meuble: 0,
    nu: 0,
    parTypologie: {},
  };
  for (const m of (missions || [])) {
    kpi.parCategorie[categorieEdl(m.type)]++;
    const meubleVal = String(m.bienMeuble || '').trim().toLowerCase();
    if (meubleVal.includes('meubl')) kpi.meuble++;
    else if (meubleVal === 'nu') kpi.nu++;
    const typo = statTypologie(m.bienTypo);
    kpi.parTypologie[typo] = (kpi.parTypologie[typo] || 0) + 1;
  }
  return kpi;
}
