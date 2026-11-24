import {Suspense} from 'react';
import QuoteScreen from './screen';
export default function Page(){return <Suspense fallback={<p>Loading your recommended ride…</p>}><QuoteScreen/></Suspense>}
