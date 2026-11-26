import { Cloud, Route, ShieldCheck } from 'lucide-react';

const features = [
  {
    title: 'Plan with live traffic',
    detail: 'See the Google Maps route, drive time and distance before booking.',
    Icon: Route,
  },
  {
    title: 'Get a backup when plans change',
    detail: 'Approve a switch if pickup stalls. If the driver cancels, opt-in auto-rebooking can find a ride within your fare limit.',
    Icon: ShieldCheck,
  },
  {
    title: 'Resume a saved ride',
    detail: 'Ride progress is saved in the cloud. Reopen the site in the same browser to continue tracking or see your receipt.',
    Icon: Cloud,
  },
];

export function RideFeatures() {
  return (
    <section id="ride-features" aria-labelledby="ride-features-title"
      className="scroll-mt-20 rounded-[28px] border border-[#dedce9] bg-[#fffdf8] p-4 sm:p-7">
      <h2 id="ride-features-title" className="mb-4 text-2xl font-black tracking-tight text-[#111a42] sm:mb-5 sm:text-3xl">How RIDE &amp; SEEK works</h2>
      <ul className="grid gap-2.5 md:grid-cols-3 md:gap-4">
        {features.map(({ title, detail, Icon }) => (
          <li key={title} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl bg-[#edf1ff] p-3.5 sm:p-4 md:grid-cols-1">
            <span className="grid size-10 place-items-center rounded-xl bg-[#173ed7] text-white"><Icon size={19} aria-hidden="true" /></span>
            <div>
              <h3 className="font-extrabold text-[#111a42]">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[#43536b]">{detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mb-0 mt-3 text-xs leading-relaxed text-[#475673]">Cloudflare delivers the site. Vercel runs the ride API, and Postgres saves the simulated rides.</p>
    </section>
  );
}
