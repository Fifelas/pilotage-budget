// Configuration publique de l'appli.
// La clé ci-dessous est la clé « publishable » de Supabase : elle est faite pour être
// intégrée dans une appli. Ce sont les règles d'accès (RLS) de la base qui protègent les données.
// Ne JAMAIS mettre ici la clé secrète (service_role).
export const SUPABASE_URL = "https://ibqxfpqgxssaycyrkoca.supabase.co";
export const SUPABASE_KEY = "sb_publishable_-5bTBqnwTvttS4XJLAjO4A_0lsjeu9b";
export const GITHUB_REPO = "Fifelas/pilotage-budget";
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
// Version Claude actuelle (relevés, budget, prêt), utilisée tant que la migration n'est pas finie
export const LEGACY_URL = "https://claude.ai/artifact/VJGoYFQzG1nLkVB9i2W35R";
