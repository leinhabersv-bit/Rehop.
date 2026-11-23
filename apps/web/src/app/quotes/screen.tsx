'use client';
import {useSearchParams} from 'next/navigation';
import QuoteList from '@/components/quotes/QuoteList';
export default function QuoteScreen(){const id=useSearchParams().get('journey');return id?<QuoteList id={id}/>:<p>Missing journey ID. Start at the booking screen.</p>}
