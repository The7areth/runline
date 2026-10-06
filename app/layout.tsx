import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Runline | Your running, in perspective',description:'A private workspace for running analysis, recovery and race preparation.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
