import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("🚨 UI Crash Captured by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{ 
            height: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '24px', 
            textAlign: 'center',
            background: '#f8fafc',
            color: '#1e1b4b',
            fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🛡️</div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '16px' }}>
            {localStorage.getItem('lang') === 'ar' ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
          </h1>
          <p style={{ fontSize: '18px', color: '#64748b', maxWidth: '500px', marginBottom: '32px', lineHeight: '1.6' }}>
            {localStorage.getItem('lang') === 'ar' 
                ? 'لقد واجهنا مشكلة تقنية في عرض هذه الصفحة. من فضلك حاول إعادة تحميل الصفحة.' 
                : 'We encountered a technical issue while rendering this page. Please try refreshing or contact support.'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{ 
                background: '#4f46e5', 
                color: 'white', 
                border: 'none', 
                padding: '12px 32px', 
                borderRadius: '12px', 
                fontWeight: '700', 
                cursor: 'pointer',
                boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)'
            }}
          >
            {localStorage.getItem('lang') === 'ar' ? 'إعادة تحميل الصفحة' : 'Refresh Page'}
          </button>
          
          {process.env.NODE_ENV === 'development' && (
            <pre style={{ marginTop: '40px', padding: '16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '13px', textAlign: 'left', maxWidth: '90%' }}>
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
