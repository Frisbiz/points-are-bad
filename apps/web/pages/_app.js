import '../styles/globals.css';
import NavBar from '../components/NavBar';
import { SessionProvider } from '../components/SessionProvider';

function MyApp({ Component, pageProps }) {
  return (
    <SessionProvider>
      <div className="container">
        <NavBar />
        <Component {...pageProps} />
      </div>
    </SessionProvider>
  );
}

export default MyApp;
