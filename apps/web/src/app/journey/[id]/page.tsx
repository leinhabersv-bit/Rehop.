'use client';
import {useParams} from 'next/navigation';
import JourneyPanel from '@/components/journey/JourneyPanel';
export default function Page(){const {id}=useParams<{id:string}>();return <JourneyPanel id={id}/>}
