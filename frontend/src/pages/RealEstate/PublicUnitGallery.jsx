import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
    Building2, MapPin, Layers, Home, Phone, 
    ChevronLeft, ChevronRight, Maximize2, X, 
    Grid, Eye, Check, MessageCircle, AlertCircle 
} from 'lucide-react';
import { getFileUrl } from '../../utils/fileUtils';

export default function PublicUnitGallery() {
    const { unitId } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [viewMode, setViewMode] = useState('slider'); // 'slider' | 'grid'
    const [lightboxIndex, setLightboxIndex] = useState(null);

    useEffect(() => {
        const fetchGallery = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await axios.get(`/api/public/units/${unitId}/gallery`);
                if (res.data?.status === 'success' && res.data?.data) {
                    setData(res.data.data);
                } else {
                    setError('لم يتم العثور على الوحدة أو انتهت صلاحية الرابط.');
                }
            } catch (err) {
                console.error('[Public Gallery Error]:', err);
                setError(err.response?.data?.message || 'تعذر تحميل معرض صور الوحدة. يرجى التأكد من صحة الرابط.');
            } finally {
                setLoading(false);
            }
        };

        if (unitId) {
            fetchGallery();
        }
    }, [unitId]);

    const photos = data?.photos || [];
    const unit = data?.unit || {};
    const company = data?.company || {};

    const handlePrev = (e) => {
        if (e) e.stopPropagation();
        if (photos.length <= 1) return;
        setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    };

    const handleNext = (e) => {
        if (e) e.stopPropagation();
        if (photos.length <= 1) return;
        setCurrentIndex((prev) => (prev + 1) % photos.length);
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (lightboxIndex !== null) {
                if (e.key === 'ArrowRight') setLightboxIndex(prev => (prev + 1) % photos.length);
                if (e.key === 'ArrowLeft') setLightboxIndex(prev => (prev - 1 + photos.length) % photos.length);
                if (e.key === 'Escape') setLightboxIndex(null);
            } else if (viewMode === 'slider') {
                if (e.key === 'ArrowRight') handleNext();
                if (e.key === 'ArrowLeft') handlePrev();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxIndex, viewMode, photos.length]);

    // Format numbers
    const formatNumber = (val) => {
        if (!val || isNaN(Number(val))) return '';
        return Number(val).toLocaleString('en-US');
    };

    // WhatsApp Inquiry Link for Client
    const cleanCompanyPhone = company.phone ? String(company.phone).replace(/[^0-9]/g, '') : '';
    const inquiryText = `مرحباً، أود الاستفسار عن تفاصيل الوحدة: ${unit.name || unit.unit_number || ''} ${unit.project_name ? 'بمشروع ' + unit.project_name : ''}.`;
    const waInquiryUrl = cleanCompanyPhone ? `https://wa.me/${cleanCompanyPhone}?text=${encodeURIComponent(inquiryText)}` : null;

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#0a0f1d',
                color: '#e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
                <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    border: '3px solid rgba(99, 102, 241, 0.2)',
                    borderTopColor: '#6366f1',
                    animation: 'spin 1s linear infinite'
                }} />
                <div style={{ marginTop: '16px', fontSize: '15px', color: '#94a3b8', fontWeight: 600 }}>
                    جاري تحميل ألبوم صور الوحدة...
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#0a0f1d',
                color: '#e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px'
                }}>
                    <AlertCircle size={32} color="#ef4444" />
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px', color: '#f8fafc' }}>
                    عذراً، تعذر عرض الصور
                </h2>
                <p style={{ fontSize: '14px', color: '#94a3b8', maxWidth: '420px', margin: '0 0 24px', lineHeight: 1.6 }}>
                    {error}
                </p>
            </div>
        );
    }

    const activePhoto = photos[currentIndex] || photos[0];
    const activeUrl = activePhoto?.url ? getFileUrl(activePhoto.url) : '';

    return (
        <div 
            dir="rtl"
            style={{
                minHeight: '100vh',
                background: '#090d16',
                color: '#f8fafc',
                fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            {/* Top Branding & Navigation Bar (Completely Public, No CRM Links) */}
            <header style={{
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(16px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                position: 'sticky',
                top: 0,
                zIndex: 40,
                padding: '12px 20px'
            }}>
                <div style={{
                    maxWidth: '1280px',
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap'
                }}>
                    {/* Brand Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {company.logo_url ? (
                            <img 
                                src={getFileUrl(company.logo_url)} 
                                alt={company.name || 'Company Logo'}
                                style={{
                                    height: '38px',
                                    maxWidth: '130px',
                                    objectFit: 'contain',
                                    borderRadius: '6px'
                                }}
                            />
                        ) : (
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Building2 size={20} color="white" />
                            </div>
                        )}
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                                {company.name || 'معرض الوحدات العقارية'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {unit.project_name ? `${unit.project_name}` : (unit.location || 'وحدة عقارية مميزة')}
                            </div>
                        </div>
                    </div>

                    {/* Actions: View Mode & WhatsApp Direct Inquiry */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            display: 'flex',
                            background: 'rgba(255,255,255,0.06)',
                            padding: '3px',
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <button
                                type="button"
                                onClick={() => setViewMode('slider')}
                                style={{
                                    border: 'none',
                                    background: viewMode === 'slider' ? '#6366f1' : 'transparent',
                                    color: viewMode === 'slider' ? '#fff' : '#94a3b8',
                                    padding: '6px 12px',
                                    borderRadius: '7px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Eye size={13} />
                                <span>سلايدر</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                style={{
                                    border: 'none',
                                    background: viewMode === 'grid' ? '#6366f1' : 'transparent',
                                    color: viewMode === 'grid' ? '#fff' : '#94a3b8',
                                    padding: '6px 12px',
                                    borderRadius: '7px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Grid size={13} />
                                <span>شبكة ({photos.length})</span>
                            </button>
                        </div>

                        {waInquiryUrl && (
                            <a
                                href={waInquiryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#16a34a',
                                    color: 'white',
                                    padding: '7px 14px',
                                    borderRadius: '9px',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    textDecoration: 'none',
                                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <MessageCircle size={15} />
                                <span>استفسار واتساب</span>
                            </a>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content Showcase */}
            <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px', width: '100%', flex: 1 }}>
                {/* Unit Details Header Banner */}
                <div style={{
                    background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.7) 100%)',
                    borderRadius: '18px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '20px 24px',
                    marginBottom: '24px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{
                                background: 'rgba(99, 102, 241, 0.2)',
                                color: '#a5b4fc',
                                border: '1px solid rgba(99, 102, 241, 0.4)',
                                fontSize: '11px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '6px'
                            }}>
                                {unit.type || 'عقار'}
                            </span>
                            {unit.unit_number && (
                                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                                    رقم الوحدة: {unit.unit_number}
                                </span>
                            )}
                        </div>
                        <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: '#f8fafc' }}>
                            {unit.name || (unit.project_name ? `وحدة في ${unit.project_name}` : 'تفاصيل الوحدة العقارية')}
                        </h1>
                        {unit.location && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', fontSize: '13px', color: '#94a3b8' }}>
                                <MapPin size={14} color="#6366f1" />
                                <span>{unit.location}</span>
                            </div>
                        )}
                    </div>

                    {/* Specs Tags */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        {unit.area_sqm && (
                            <div style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>المساحة</div>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                                    {unit.area_sqm} م²
                                </div>
                            </div>
                        )}
                        {unit.rooms !== undefined && unit.rooms !== null && Number(unit.rooms) > 0 && (
                            <div style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>الغرف</div>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                                    {unit.rooms}
                                </div>
                            </div>
                        )}
                        {unit.floor !== undefined && unit.floor !== null && String(unit.floor).trim() !== '' && (
                            <div style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '8px 14px',
                                borderRadius: '10px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>الدور</div>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                                    {unit.floor}
                                </div>
                            </div>
                        )}
                        {unit.price && Number(unit.price) > 0 && (
                            <div style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                padding: '8px 16px',
                                borderRadius: '10px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 700 }}>السعر المطلوب</div>
                                <div style={{ fontSize: '17px', fontWeight: 900, color: '#10b981' }}>
                                    {formatNumber(unit.price)} ج.م
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Photo Viewer Section */}
                {photos.length === 0 ? (
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px dashed rgba(255,255,255,0.15)',
                        borderRadius: '16px',
                        padding: '60px 20px',
                        textAlign: 'center',
                        color: '#94a3b8'
                    }}>
                        <Home size={40} color="#64748b" style={{ margin: '0 auto 12px' }} />
                        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px', color: '#f8fafc' }}>
                            لا توجد صور مرفقة لهذه الوحدة حالياً
                        </h3>
                        <p style={{ fontSize: '13px', margin: 0 }}>
                            يمكنك التواصل مع إدارة المبيعات لطلب ملف الصور والمخططات الهندسية.
                        </p>
                    </div>
                ) : viewMode === 'slider' ? (
                    /* ─── SLIDER VIEW ─── */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Main Stage */}
                        <div style={{
                            position: 'relative',
                            width: '100%',
                            height: '560px',
                            maxHeight: '75vh',
                            borderRadius: '20px',
                            overflow: 'hidden',
                            background: '#030712',
                            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            {/* Ambient Blurred Backdrop */}
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                backgroundImage: `url(${activeUrl})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                filter: 'blur(30px) brightness(0.35)',
                                transform: 'scale(1.15)',
                                transition: 'background-image 0.4s ease'
                            }} />

                            {/* Main Focused Image */}
                            <img 
                                src={activeUrl}
                                alt={activePhoto?.original_name || 'Unit photo'}
                                onClick={() => setLightboxIndex(currentIndex)}
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='9' cy='9' r='2'%3E%3C/circle%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'%3E%3C/path%3E%3C/svg%3E";
                                }}
                                style={{
                                    position: 'relative',
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    cursor: 'pointer',
                                    zIndex: 2,
                                    transition: 'transform 0.3s'
                                }}
                                title="اضغط للتكبير على كامل الشاشة"
                            />

                            {/* Prev Button */}
                            {photos.length > 1 && (
                                <button
                                    type="button"
                                    onClick={handlePrev}
                                    style={{
                                        position: 'absolute',
                                        right: '16px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '46px',
                                        height: '46px',
                                        borderRadius: '50%',
                                        background: 'rgba(15, 23, 42, 0.75)',
                                        backdropFilter: 'blur(8px)',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        zIndex: 10,
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'; e.currentTarget.style.transform = 'translateY(-50%) scale(1)'; }}
                                    title="الصورة السابقة"
                                >
                                    <ChevronRight size={26} />
                                </button>
                            )}

                            {/* Next Button */}
                            {photos.length > 1 && (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    style={{
                                        position: 'absolute',
                                        left: '16px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '46px',
                                        height: '46px',
                                        borderRadius: '50%',
                                        background: 'rgba(15, 23, 42, 0.75)',
                                        backdropFilter: 'blur(8px)',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        zIndex: 10,
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'; e.currentTarget.style.transform = 'translateY(-50%) scale(1)'; }}
                                    title="الصورة التالية"
                                >
                                    <ChevronLeft size={26} />
                                </button>
                            )}

                            {/* Counter Badge */}
                            <div style={{
                                position: 'absolute',
                                bottom: '16px',
                                left: '16px',
                                background: 'rgba(0, 0, 0, 0.65)',
                                backdropFilter: 'blur(8px)',
                                color: 'white',
                                fontSize: '13px',
                                fontWeight: 800,
                                padding: '4px 12px',
                                borderRadius: '20px',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                zIndex: 10
                            }}>
                                <span>{currentIndex + 1}</span> / <span>{photos.length}</span>
                            </div>

                            {/* Fullscreen Expand Button */}
                            <button
                                type="button"
                                onClick={() => setLightboxIndex(currentIndex)}
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    left: '16px',
                                    background: 'rgba(0, 0, 0, 0.65)',
                                    backdropFilter: 'blur(8px)',
                                    color: 'white',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    padding: '8px',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 10,
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#6366f1'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)'; }}
                                title="تكبير على كامل الشاشة"
                            >
                                <Maximize2 size={16} />
                            </button>
                        </div>

                        {/* Thumbnails Carousel Strip */}
                        {photos.length > 1 && (
                            <div style={{
                                display: 'flex',
                                gap: '10px',
                                overflowX: 'auto',
                                padding: '8px 2px',
                                scrollbarWidth: 'thin'
                            }}>
                                {photos.map((photo, pIdx) => {
                                    const isCurrent = pIdx === currentIndex;
                                    const imgUrl = photo.url ? getFileUrl(photo.url) : '';
                                    return (
                                        <button
                                            key={photo.id || pIdx}
                                            type="button"
                                            onClick={() => setCurrentIndex(pIdx)}
                                            style={{
                                                flex: '0 0 90px',
                                                height: '68px',
                                                borderRadius: '12px',
                                                overflow: 'hidden',
                                                border: isCurrent ? '3px solid #6366f1' : '1px solid rgba(255,255,255,0.15)',
                                                padding: 0,
                                                background: '#1e293b',
                                                cursor: 'pointer',
                                                opacity: isCurrent ? 1 : 0.6,
                                                transform: isCurrent ? 'scale(1.05)' : 'scale(1)',
                                                transition: 'all 0.2s',
                                                boxShadow: isCurrent ? '0 4px 14px rgba(99, 102, 241, 0.4)' : 'none'
                                            }}
                                            onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.opacity = '1'; }}
                                            onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.opacity = '0.6'; }}
                                        >
                                            <img 
                                                src={imgUrl} 
                                                alt={`Thumbnail ${pIdx + 1}`} 
                                                onError={(e) => {
                                                    e.currentTarget.onerror = null;
                                                    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='9' cy='9' r='2'%3E%3C/circle%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'%3E%3C/path%3E%3C/svg%3E";
                                                }}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ─── GRID VIEW ─── */
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '16px'
                    }}>
                        {photos.map((photo, pIdx) => {
                            const imgUrl = photo.url ? getFileUrl(photo.url) : '';
                            return (
                                <div
                                    key={photo.id || pIdx}
                                    onClick={() => setLightboxIndex(pIdx)}
                                    style={{
                                        position: 'relative',
                                        height: '240px',
                                        borderRadius: '16px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        background: '#1e293b',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                        transition: 'transform 0.25s, box-shadow 0.25s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-4px)';
                                        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.5)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                                    }}
                                >
                                    <img 
                                        src={imgUrl} 
                                        alt={photo.original_name || `Photo ${pIdx + 1}`}
                                        onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1.5'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'%3E%3C/rect%3E%3Ccircle cx='9' cy='9' r='2'%3E%3C/circle%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'%3E%3C/path%3E%3C/svg%3E";
                                        }}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '10px',
                                        right: '10px',
                                        background: 'rgba(0,0,0,0.7)',
                                        backdropFilter: 'blur(6px)',
                                        color: 'white',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        padding: '3px 8px',
                                        borderRadius: '8px'
                                    }}>
                                        #{pIdx + 1}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Bottom CTA Card */}
                {waInquiryUrl && (
                    <div style={{
                        marginTop: '36px',
                        background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)',
                        border: '1px solid rgba(22, 163, 74, 0.3)',
                        borderRadius: '18px',
                        padding: '24px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px'
                    }}>
                        <div>
                            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px', color: '#f8fafc' }}>
                                هل أنت مهتم بهذه الوحدة أو ترغب في المعاينة؟
                            </h3>
                            <p style={{ fontSize: '13px', color: '#cbd5e1', margin: 0 }}>
                                تواصل مع مسؤولي المبيعات في {company.name || 'الشركة'} مباشرة عبر واتساب للحصول على تفاصيل الأسعار وجدول السداد والمزيد من الصور.
                            </p>
                        </div>
                        <a
                            href={waInquiryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#16a34a',
                                color: 'white',
                                padding: '12px 24px',
                                borderRadius: '12px',
                                fontSize: '14px',
                                fontWeight: 800,
                                textDecoration: 'none',
                                boxShadow: '0 6px 20px rgba(22, 163, 74, 0.4)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <MessageCircle size={18} />
                            <span>تواصل عبر واتساب الآن</span>
                        </a>
                    </div>
                )}
            </main>

            {/* Lightbox / Fullscreen Modal */}
            {lightboxIndex !== null && photos[lightboxIndex] && (
                <div 
                    onClick={() => setLightboxIndex(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 100,
                        background: 'rgba(3, 7, 18, 0.95)',
                        backdropFilter: 'blur(16px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '20px'
                    }}
                >
                    {/* Header */}
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            zIndex: 10
                        }}
                    >
                        <div style={{ color: 'white', fontSize: '14px', fontWeight: 800 }}>
                            <span>{lightboxIndex + 1}</span> / <span>{photos.length}</span>
                            <span style={{ margin: '0 10px', opacity: 0.4 }}>•</span>
                            <span>{unit.name || 'صورة الوحدة'}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setLightboxIndex(null)}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                color: 'white',
                                width: '38px',
                                height: '38px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                            title="إغلاق"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Middle Stage with Next/Prev */}
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 0'
                    }}>
                        {photos.length > 1 && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxIndex(prev => (prev - 1 + photos.length) % photos.length);
                                }}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    width: '50px',
                                    height: '50px',
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    zIndex: 20
                                }}
                                title="السابق"
                            >
                                <ChevronRight size={28} />
                            </button>
                        )}

                        <img 
                            src={getFileUrl(photos[lightboxIndex]?.url)}
                            alt={photos[lightboxIndex]?.original_name || 'Unit Photo'}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                maxWidth: '92%',
                                maxHeight: 'calc(100vh - 160px)',
                                objectFit: 'contain',
                                borderRadius: '12px',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
                            }}
                        />

                        {photos.length > 1 && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setLightboxIndex(prev => (prev + 1) % photos.length);
                                }}
                                style={{
                                    position: 'absolute',
                                    left: '10px',
                                    width: '50px',
                                    height: '50px',
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    zIndex: 20
                                }}
                                title="التالي"
                            >
                                <ChevronLeft size={28} />
                            </button>
                        )}
                    </div>

                    {/* Bottom Thumbnail Strip */}
                    {photos.length > 1 && (
                        <div 
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                display: 'flex',
                                gap: '8px',
                                maxWidth: '100%',
                                overflowX: 'auto',
                                padding: '6px 12px',
                                background: 'rgba(0, 0, 0, 0.5)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '14px',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            {photos.map((p, pIdx) => {
                                const isActive = pIdx === lightboxIndex;
                                return (
                                    <button
                                        key={p.id || pIdx}
                                        type="button"
                                        onClick={() => setLightboxIndex(pIdx)}
                                        style={{
                                            width: '60px',
                                            height: '46px',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            border: isActive ? '2.5px solid #6366f1' : '1px solid rgba(255,255,255,0.2)',
                                            padding: 0,
                                            background: '#1e293b',
                                            cursor: 'pointer',
                                            opacity: isActive ? 1 : 0.5,
                                            transform: isActive ? 'scale(1.06)' : 'scale(1)',
                                            transition: 'all 0.2s',
                                            flexShrink: 0
                                        }}
                                    >
                                        <img 
                                            src={getFileUrl(p.url)} 
                                            alt={`Thumb ${pIdx + 1}`} 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Clean Footer (No links) */}
            <footer style={{
                textAlign: 'center',
                padding: '24px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '12px',
                color: '#64748b'
            }}>
                <div>جميع الحقوق محفوظة © {company.name || 'الشركة'} {new Date().getFullYear()}</div>
            </footer>
        </div>
    );
}
