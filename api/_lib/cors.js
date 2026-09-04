// Origine CORS partagée par toutes les fonctions api/*.js.
//
// Auparavant "Access-Control-Allow-Origin: *" partout : n'importe quel site
// pouvait faire lire par le navigateur d'un visiteur la réponse d'un de ces
// endpoints. Le seul appelant légitime est l'app elle-même (app.lokentia.fr,
// servie sous ce seul domaine — pas de widget ni d'iframe embarqué sur un
// site tiers), plus les previews Vercel de ce projet le temps de tester une
// PR avant de la merger.
const ORIGINE_PROD = 'https://app.lokentia.fr';
const RE_PREVIEW_VERCEL = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

// Renvoie l'origine à autoriser pour CETTE requête : celle du visiteur si
// elle est légitime (reflétée telle quelle, seule façon correcte de
// combiner CORS avec des identifiants/cookies), sinon un repli neutre vers
// la prod — jamais "*", et jamais une origine tierce arbitraire.
//
// Compatible avec les deux styles de runtime utilisés dans api/ : Edge
// (req.headers est un Headers avec .get()) et Node classique (req.headers
// est un objet simple, clés en minuscules).
export function origineAutorisee(req) {
  let origin = '';
  if (req && req.headers) {
    origin = (typeof req.headers.get === 'function') ? (req.headers.get('origin') || '') : (req.headers.origin || '');
  }
  if (origin === ORIGINE_PROD || RE_PREVIEW_VERCEL.test(origin)) return origin;
  return ORIGINE_PROD;
}
