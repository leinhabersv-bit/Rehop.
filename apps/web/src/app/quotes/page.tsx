import {Suspense} from 'react';
import QuoteScreen from './screen';
export default function Page(){return <Suspense fallback={<p>Loading ride comparison…</p>}><QuoteScreen/></Suspense>}
