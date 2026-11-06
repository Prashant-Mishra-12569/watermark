/**
 * Short names for the demo apps used to record the demo video. One real card can stamp only one wallet per app (on
 * purpose), so each recorded tap uses a fresh demo app with the same card list as the live app (RuPay bank debit,
 * no prepaid), registered on Whitechain by our deployer. `/verify?app=001` reads better on screen than a 74-digit id.
 * Anything that isn't a short name passes through unchanged.
 */
export const DEMO_APPS: Readonly<Record<string, string>> = {
  "001": "2722791541143013573342468489011609327613534512421336087192179532038367406",
  "002": "200106063841493522611003299919761051625199909596192001278945742778121366798",
  "003": "289777351453038870657034164707767661561779552350247198511169581227152952160",
};

export function resolveDemoApp(app: string | null): string | null {
  if (app === null) return null;
  return DEMO_APPS[app.trim()] ?? app;
}
