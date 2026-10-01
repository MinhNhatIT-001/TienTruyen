import type { Metadata } from 'next';
import './globals.css';
import { AppProvider, Header, Footer } from '../components/shell';
export const metadata:Metadata={title:{default:'Tiên Truyện — Một trang sách, vạn dặm nhân gian',template:'%s · Tiên Truyện'},description:'Khám phá những thế giới mới qua từng trang truyện. Không gian đọc tinh tế dành cho bạn.',robots:{index:true,follow:true}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="vi"><body><AppProvider><Header/>{children}<Footer/></AppProvider></body></html>}
