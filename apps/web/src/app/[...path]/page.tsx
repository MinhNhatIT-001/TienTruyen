import { RoutePage } from '../../components/routes';
export default async function Page({params}:{params:Promise<{path:string[]}>}){const {path}=await params;return <RoutePage path={path}/>}
