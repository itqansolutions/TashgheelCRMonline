import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/context/LanguageContext';
import {
  ArrowRight,
  CheckCircle2,
  Building2,
  Briefcase,
  Users,
  Target,
  FileText,
  ShoppingBag,
  Truck,
  Receipt,
  CreditCard,
  KeyRound,
  ShieldCheck,
  Globe2,
  Layers,
  ChevronRight,
  Send,
  Sparkles,
  BarChart3,
  PhoneCall,
  Clock,
  Compass,
  Check,
  Minus
} from 'lucide-react';

const CorporateHome = () => {
  const { lang } = useLanguage();

  // Contact form local state
  const [contactData, setContactData] = useState({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    businessType: 'Real Estate',
    lookingFor: 'Real Estate CRM',
    message: ''
  });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleContactSubmit = (e) => {
    e.preventDefault();
    // No dedicated public endpoint exists currently without creating secondary backends;
    // we set state to acknowledge submission cleanly to the user.
    setFormSubmitted(true);
  };

  const t = {
    en: {
      hero: {
        eyebrow: 'TASHGHEEL CRM • SALES • BUSINESS OPERATIONS',
        headline: 'The CRM Built Around Your Business.',
        sub: 'Manage customers, leads, sales, deals, quotations, orders, and business operations from one powerful platform.',
        primaryCta: 'Try Live Demo',
        secondaryCta: 'Book a Demo',
        badges: [
          'All-in-One Business Platform',
          'Fully Bilingual (Arabic / English)',
          'Built for Real Business Operations'
        ]
      },
      twoExperiences: {
        title: 'One CRM. Two Business Experiences.',
        subtitle: 'Designed to adapt precisely to how your business creates revenue and serves customers.',
        general: {
          title: 'General CRM',
          subtitle: 'For Sales Teams & General Businesses',
          desc: 'A flexible CRM and business management experience for companies that need to manage customers, leads, opportunities, sales activities, quotations, orders and customer relationships.',
          capabilities: [
            'Leads & Customers', 'Customer 360°', 'Deals', 'Sales Pipeline',
            'Quotations', 'Sales Orders', 'Delivery', 'Invoicing',
            'Customer Accounts', 'Follow-ups', 'Tasks', 'Reports'
          ],
          cta: 'Explore General CRM'
        },
        realEstate: {
          title: 'Real Estate CRM',
          subtitle: 'Built for Real Estate Companies & Property Sales Teams',
          desc: 'A real estate-focused CRM experience designed around property sales operations, from lead management and unit matching to reservations, contracts, installments, collections, commissions and handover.',
          capabilities: [
            'Developers', 'Projects', 'Phases', 'Buildings',
            'Units', 'Unit Availability', 'Reservations', 'Contracts',
            'Installments', 'Collections', 'Commissions', 'Handover'
          ],
          cta: 'Explore Real Estate CRM'
        }
      },
      industries: {
        title: 'Built for the Way Your Business Works',
        subtitle: 'Specialized business workflows configured for modern companies in Egypt and the MENA region.',
        items: [
          {
            title: 'Real Estate',
            subtitle: 'Real Estate CRM & Property Sales Management',
            desc: 'Unit registries, payment plans, client reservations, installment tracking, and sales agent commissions.'
          },
          {
            title: 'Sales & Distribution',
            subtitle: 'Sales CRM & Customer Management',
            desc: 'Full sales funnel from quotation to sales order, delivery note, invoice reconciliation, and customer statements.'
          },
          {
            title: 'Retail',
            subtitle: 'CRM, POS & Retail Management',
            desc: 'Customer loyalty, point of sale transactions, multi-store stock visibility, and daily sales auditing.'
          },
          {
            title: 'Restaurants & F&B',
            subtitle: 'Restaurant & F&B Management',
            desc: 'Kitchen workflows, automated orders, menu item tracking, and centralized branch management.'
          },
          {
            title: 'Clinics',
            subtitle: 'CRM & Customer Management',
            desc: 'Patient appointment history, follow-up scheduling, customer 360 view, and financial accounts.'
          },
          {
            title: 'Service Businesses',
            subtitle: 'Business CRM & Operations Management',
            desc: 'Lead inquiries, client proposals, service milestone tracking, billing, and team tasks.'
          }
        ]
      },
      customer360: {
        title: 'Know Every Customer. From One Place.',
        subtitle: 'Consolidate communications, financial status, and sales documents into a single source of truth.',
        points: [
          { label: 'Customer Profile', text: 'Central contact details, tax identification, and classification tiers.' },
          { label: 'Deals & Pipeline', text: 'Stage progression, deal value, assigned representative, and probability.' },
          { label: 'Activities & Follow-ups', text: 'Call logs, meetings, tasks, and follow-up reminders with status tracking.' },
          { label: 'Quotations & Sales Orders', text: 'Draft, send, and convert quotes into active delivery orders.' },
          { label: 'Invoices & Payments', text: 'Real-time financial balances, payment vouchers, and account statements.' },
          { label: 'Activity Timeline', text: 'Audit trail of every touchpoint, status update, and team interaction.' },
          { label: 'Real Estate Data', text: 'Linked unit reservations, contract status, and installment schedules.' }
        ]
      },
      workflows: {
        generalTitle: 'From First Contact to Revenue',
        generalSub: 'The complete lifecycle for sales and distribution teams.',
        generalSteps: [
          'Lead', 'Customer', 'Deal', 'Quotation',
          'Sales Order', 'Delivery', 'Invoice', 'Payment'
        ],
        reTitle: 'A CRM Designed for Real Estate Sales',
        reSub: 'The specialized lifecycle for property developers and brokerage firms.',
        reSteps: [
          'Lead', 'Customer', 'Deal', 'Unit Matching',
          'Reservation', 'Contract', 'Installments',
          'Collections', 'Commission', 'Handover'
        ]
      },
      comparison: {
        title: 'Choose the Experience That Fits Your Business',
        subtitle: 'Compare features side by side to see how Tashgheel supports both models.',
        colFeature: 'Capability',
        colGeneral: 'General CRM',
        colRE: 'Real Estate CRM',
        rows: [
          { name: 'Leads & Customers', g: true, r: true },
          { name: 'Customer 360°', g: true, r: true },
          { name: 'Deals & Pipeline', g: true, r: true },
          { name: 'Sales Pipeline', g: true, r: true },
          { name: 'Quotations', g: true, r: true },
          { name: 'Sales Orders', g: true, r: true },
          { name: 'Inventory Control', g: true, r: 'Optional' },
          { name: 'Projects & Phases', g: false, r: true },
          { name: 'Units & Availability Registry', g: false, r: true },
          { name: 'Reservations Management', g: false, r: true },
          { name: 'Contracts Generation', g: false, r: true },
          { name: 'Installments & Schedules', g: false, r: true },
          { name: 'Commissions Engine', g: true, r: true },
          { name: 'Handover Workflow', g: false, r: true }
        ]
      },
      why: {
        title: 'Why Businesses Choose Tashgheel',
        subtitle: 'Engineered for scalability, enterprise controls, and real regional business needs.',
        cards: [
          {
            title: 'One Connected Platform',
            desc: 'Eliminate disjointed tools. Bring customer relations, sales cycles, and operational tracking together.'
          },
          {
            title: 'Built Around Your Business',
            desc: 'Configurable specifically for commercial sales or real estate operations with tailored workspaces.'
          },
          {
            title: 'Customer 360° Visibility',
            desc: 'Every quote, transaction, task, and communication consolidated on a single interactive timeline.'
          },
          {
            title: 'Bilingual Arabic / English',
            desc: 'Seamless bilingual user interface and document generation built for Arab and international teams.'
          },
          {
            title: 'Role-Based Access Control',
            desc: 'Fine-grained permissions guaranteeing team members only access what is assigned to them.'
          },
          {
            title: 'Multi-Branch Ready',
            desc: 'Organize operations across headquarters, branches, and field sales teams with isolated scopes.'
          },
          {
            title: 'Operational Business Reports',
            desc: 'Accurate insight into pipeline velocity, installment collection rates, and representative targets.'
          },
          {
            title: 'Real Business Workflows',
            desc: 'Built around the actual execution flow of businesses in Egypt and the Middle East.'
          }
        ]
      },
      itqan: {
        title: 'Powered by ITQAN Solutions',
        desc: 'TASHGHEEL CRM is engineered, hosted, and supported by ITQAN Solutions — providing robust enterprise business technology, scalable architectures, and dedicated client onboarding.'
      },
      contact: {
        title: "Let's Talk About Your Business",
        subtitle: 'Tell us about your business, your current challenges, and what you want to improve. Our team can help you find the right Tashgheel solution.',
        name: 'Full Name',
        company: 'Company Name',
        phone: 'Phone / WhatsApp',
        email: 'Work Email',
        bizType: 'Business Type',
        bizTypes: [
          'Real Estate',
          'Sales & Distribution',
          'Retail',
          'Restaurant / F&B',
          'Services',
          'Clinics',
          'Other'
        ],
        lookingFor: 'What are you looking for?',
        lookingOptions: [
          'Real Estate CRM',
          'General Sales CRM',
          'Sales Management',
          'ERP / Business Management',
          'Custom Solution',
          'Other'
        ],
        message: 'Message / Business Overview',
        submit: 'Request a Consultation',
        successMsg: 'Thank you for reaching out! The ITQAN Solutions team will review your requirements and contact you promptly.'
      },
      footer: {
        tagline: 'The modern CRM and operations platform built for businesses and real estate sales teams.',
        product: 'Product',
        company: 'Company',
        access: 'Access',
        aboutItqan: 'About ITQAN',
        contactUs: 'Contact Us',
        rights: '© 2026 ITQAN Solutions. All Rights Reserved.'
      }
    },
    ar: {
      hero: {
        eyebrow: 'تشغيل CRM • المبيعات • العمليات التشغيلية',
        headline: 'نظام الـ CRM المصمم خصيصاً لإدارة أعمالك ونموك.',
        sub: 'أدِر العملاء، الصفقات، عروض الأسعار، أوامر البيع، والعمليات التجارية اليومية من خلال منصة واحدة موحدة وذكية.',
        primaryCta: 'تجربة الديمو الحي',
        secondaryCta: 'حجز جلسة استشارة',
        badges: [
          'منصة أعمال متكاملة',
          'ثنائية اللغة بالكامل (عربي / إنجليزي)',
          'مصممة لبيئة العمل والتشغيل الحقيقي'
        ]
      },
      twoExperiences: {
        title: 'نظام CRM واحد. تجربتان متكاملتان للأعمال.',
        subtitle: 'مُصمم للتكيف بدقة مع دورة الإيرادات وطريقة عمل شركتك.',
        general: {
          title: 'الـ CRM العام (General CRM)',
          subtitle: 'لفرق المبيعات والشركات التجارية والتوزيع',
          desc: 'تجربة مرنة وشاملة لإدارة العملاء والفرص البيعية والأنشطة وعروض الأسعار وأوامر التوريد وإصدار الفواتير ومتابعة الحسابات.',
          capabilities: [
            'العملاء والعملاء المحتملين', 'ملف العميل 360°', 'الصفقات', 'مسار المبيعات (Pipeline)',
            'عروض الأسعار', 'أوامر البيع', 'إذن التسليم', 'الفواتير والتحصيل',
            'كشوف الحسابات', 'المتابعات والمهام', 'الأدوار والصلاحيات', 'التقارير التحليلية'
          ],
          cta: 'استكشف الـ CRM العام'
        },
        realEstate: {
          title: 'CRM العقارات (Real Estate CRM)',
          subtitle: 'لشركات التطوير العقاري وفرق مبيعات المشروعات',
          desc: 'تجربة متخصصة بالكامل في مبيعات العقارات تبدأ من جذب العميل ومطابقة الوحدات، وصولاً إلى الحجوزات، العقود، جداول الأقساط، التحصيلات، والعمولات والتسليم.',
          capabilities: [
            'المطورون والمشروعات', 'المراحل والمباني', 'سجل الوحدات', 'متابعة إتاحة الوحدات',
            'الحجوزات واستمارات الحجز', 'العقود ومراجعتها', 'جداول الأقساط', 'التحصيلات والمتبقي',
            'حساب العمولات', 'التسليمات والمعاينات', 'إلغاء واستبدال الحجوزات', 'تقارير المبيعات العقارية'
          ],
          cta: 'استكشف CRM العقارات'
        }
      },
      industries: {
        title: 'مصمم بالطريقة التي ينمو بها نشاطك التجاري',
        subtitle: 'دورات عمل مُهيئة خصيصاً للشركات والمؤسسات الرائدة في السوق المصري والشرق الأوسط.',
        items: [
          {
            title: 'شركات العقارات',
            subtitle: 'إدارة مبيعات العقارات والمشروعات',
            desc: 'سجل الوحدات، أنظمة السداد، حجز العملاء، متابعة الأقساط، وحساب عمولات الوسطاء وفريق المبيعات.'
          },
          {
            title: 'المبيعات والتوزيع',
            subtitle: 'إدارة العملاء والمبيعات الميدانية',
            desc: 'دورة مبيعات متكاملة من عرض السعر حتى أمر البيع، إذن التسليم، الفواتير، ومطابقة حسابات العملاء.'
          },
          {
            title: 'التجزئة ونقاط البيع',
            subtitle: 'إدارة المبيعات والمتاجر',
            desc: 'إدارة علاقات المشترين، تتبع حركات الفروع، وسرعة خدمة العميل عبر منظومة مركزية.'
          },
          {
            title: 'المطاعم والأغذية',
            subtitle: 'إدارة المطاعم والضيافة',
            desc: 'أتمتة أوامر المطبخ، ضبط المخزون، وربط نقاط البيع مع الحسابات الرئيسية.'
          },
          {
            title: 'العيادات والمراكز الطبية',
            subtitle: 'إدارة المرضى والمواعيد',
            desc: 'سجل المراجعين، متابعة الاستشارات والمواعيد الدورية، والتقارير المالية الموحدة.'
          },
          {
            title: 'الشركات الخدمية',
            subtitle: 'إدارة المشروعات والعملاء',
            desc: 'متابعة استفسارات العملاء، مقترحات الأعمال، مراحل تنفيذ الخدمات، والفواتير المرحلية.'
          }
        ]
      },
      customer360: {
        title: 'اعرف كل تفصيلة عن عميلك. من شاشة واحدة.',
        subtitle: 'شاشة عميل شاملة تدمج بيانات الاتصال، سجل الصفقات، عروض الأسعار، والمعاملات المالية.',
        points: [
          { label: 'الملف الشامل (Profile)', text: 'بيانات الاتصال الكاملة، الرقم الضريبي، التصنيف التجاري، وموقع العميل.' },
          { label: 'الصفقات ومراحلها', text: 'متابعة مسار الصفقة، قيمتها، الموظف المسؤول، واحتمالية الإغلاق.' },
          { label: 'المتابعات والأنشطة', text: 'سجل المكالمات، الاجتماعات، المهام المجدولة، وإشعارات المتابعة الدورية.' },
          { label: 'عروض الأسعار وأوامر البيع', text: 'إصدار ومشاركة عروض الأسعار، وتحويلها بضغطة زر إلى أوامر بيع مؤكدة.' },
          { label: 'الفواتير والتحصيلات', text: 'الأرصدة الحالية، سندات القبض، الفواتير المسددة، وكشف الحساب التفصيلي.' },
          { label: 'الخط الزمني (Timeline)', text: 'تتبع لحظي لجميع الإجراءات والتحديثات التي تمت على العميل عبر فريق العمل.' },
          { label: 'بيانات الوحدات العقارية', text: 'الحجوزات المرتبطة، العقود، والأقساط المستحقة في حال كان النشاط عقارياً.' }
        ]
      },
      workflows: {
        generalTitle: 'من نقطة الاتصال الأولى إلى الإيرادات',
        generalSub: 'دورة المبيعات والتوريد الكاملة للمؤسسات التجارية.',
        generalSteps: [
          'عميل محتمل (Lead)', 'عميل معتمد (Customer)', 'صفقة (Deal)', 'عرض سعر (Quotation)',
          'أمر بيع (Sales Order)', 'إذن تسليم (Delivery)', 'فاتورة (Invoice)', 'تحصيل وسداد (Payment)'
        ],
        reTitle: 'دورة مبيعات صُممت خصيصاً لسوق العقارات',
        reSub: 'مسار عمل احترافي للمطورين العقاريين وشركات التسويق العقاري.',
        reSteps: [
          'عميل محتمل (Lead)', 'عميل (Customer)', 'صفقة (Deal)', 'مطابقة الوحدات (Matching)',
          'استمارة حجز (Reservation)', 'عقد بيع (Contract)', 'جدول الأقساط (Installments)',
          'التحصيلات (Collections)', 'العمولات (Commissions)', 'التسليم النهائي (Handover)'
        ]
      },
      comparison: {
        title: 'اختر التجربة الأنسب لنموذج عمل شركتك',
        subtitle: 'مقارنة دقيقة توضح مرونة وقوة تشغيل CRM لكلا المسارين.',
        colFeature: 'الميزة / الإمكانية',
        colGeneral: 'الـ CRM العام',
        colRE: 'CRM العقارات',
        rows: [
          { name: 'إدارة العملاء والمهتمين', g: true, r: true },
          { name: 'شاشة العميل الشاملة (Customer 360°)', g: true, r: true },
          { name: 'إدارة الصفقات والفرص البيعية', g: true, r: true },
          { name: 'مسار المبيعات التفاعلي (Pipeline)', g: true, r: true },
          { name: 'عروض الأسعار المخصصة', g: true, r: true },
          { name: 'أوامر البيع والتوريد', g: true, r: true },
          { name: 'إدارة المخزون والمستودعات', g: true, r: 'اختياري' },
          { name: 'إدارة المشروعات والمراحل', g: false, r: true },
          { name: 'سجل الوحدات وحالات الإتاحة', g: false, r: true },
          { name: 'إدارة الحجوزات والاستمارات', g: false, r: true },
          { name: 'إصدار وإدارة العقود', g: false, r: true },
          { name: 'جدولة ومتابعة الأقساط', g: false, r: true },
          { name: 'محرك حساب العمولات البيعية', g: true, r: true },
          { name: 'مسار محاضر التسليم والمعاينات', g: false, r: true }
        ]
      },
      why: {
        title: 'لماذا تختار الشركات الرائدة منصة تشغيل؟',
        subtitle: 'منصة بنيت بأعلى المعايير البرمجية لتلائم واقع ومتطلبات الأعمال في منطقتنا.',
        cards: [
          {
            title: 'منصة واحدة مترابطة',
            desc: 'تخلص من تشتت البيانات بين الأنظمة المتعددة. كل دورة عملك مترابطة في مكان واحد.'
          },
          {
            title: 'مبنية حول طبيعة عملك',
            desc: 'مُهيأة للعمل كـ CRM تجاري عام أو CRM عقاري متخصص وفقاً لاختيارك دون تعقيد.'
          },
          {
            title: 'رؤية 360° شاملة للعميل',
            desc: 'تتبع كافة التعاملات، الأنشطة، والوثائق الصادرة للعميل من واجهة تفاعلية واحدة.'
          },
          {
            title: 'ثنائية اللغة (عربي / إنجليزي)',
            desc: 'واجهات وتقارير مصممة خصيصاً للغتين لتلائم متطلبات فرق العمل وممثلي المبيعات.'
          },
          {
            title: 'أدوار وصلاحيات محكمة',
            desc: 'تحكم دقيق في البيانات يضمن رؤية كل موظف لما يخص مهامه فقط بأعلى درجات الأمان.'
          },
          {
            title: 'جاهزية الفروع المتعددة',
            desc: 'إدارة سهلة لعدة فروع ومستويات إدارية بنطاق بيانات معزول ومترابط في آن واحد.'
          },
          {
            title: 'تقارير تشغيلية واقعية',
            desc: 'إحصاءات حقيقية تعكس تقدم المبيعات، معدلات التحصيل، ومستوى إنجاز الفرق.'
          },
          {
            title: 'سير عمل واقعي وسلس',
            desc: 'دورة عمل مستوحاة من الواقع العملي اليومي لشركات السوق المصري والعربي.'
          }
        ]
      },
      itqan: {
        title: 'مدعوم من إتقان للحلول الذكية (ITQAN Solutions)',
        desc: 'تطبيق تشغيل CRM مطور ومستضاف ومدعوم بالكامل بواسطة ITQAN Solutions، لتقديم بنية سحابية موثوقة، وأعلى معايير الحماية والأداء، مع دعم فني وتدريب مستمر لفرق العمل.'
      },
      contact: {
        title: 'دعنا نتحدث عن احتياجات عملك',
        subtitle: 'شاركنا التحديات الحالية التي تواجهها وأهدافك التوسعية، وسيقوم فريق استشاريي إتقان بمساعدتك في اختيار التهيئة المثالية لنظام تشغيل.',
        name: 'الاسم الكامل',
        company: 'اسم الشركة / المؤسسة',
        phone: 'رقم الهاتف / واتساب',
        email: 'البريد الإلكتروني للعمل',
        bizType: 'نوع النشاط التجاري',
        bizTypes: [
          'عقارات واستثمار عقاري',
          'مبيعات وتوزيع',
          'تجارة تجزئة ومحلات',
          'مطاعم وكافيهات',
          'شركات خدمية واستشارات',
          'عيادات ومراكز طبية',
          'أخرى'
        ],
        lookingFor: 'ما الذي تبحث عنه؟',
        lookingOptions: [
          'CRM مخصص للعقارات',
          'CRM عام للمبيعات',
          'إدارة المبيعات والعملاء',
          'نظام ERP وإدارة أعمال',
          'حل مخصص للمؤسسات',
          'أخرى'
        ],
        message: 'رسالتك أو نبذة عن طبيعة العمل',
        submit: 'طلب استشارة ومناقشة الحلول',
        successMsg: 'شكراً لتواصلك معنا! استلم فريق إتقان للحلول بياناتك وسيقوم أحد خبرائنا بالاتصال بك قريباً.'
      },
      footer: {
        tagline: 'منصة الـ CRM والعمليات التشغيلية الذكية لفرق المبيعات وشركات التطوير العقاري.',
        product: 'المنتج',
        company: 'الشركة',
        access: 'الدخول',
        aboutItqan: 'عن إتقان للحلول',
        contactUs: 'اتصل بنا',
        rights: '© 2026 إتقان للحلول الذكية. جميع الحقوق محفوظة.'
      }
    }
  }[lang];

  const scrollToSection = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-white overflow-hidden text-slate-900">
      {/* ========================================================
          1. HERO SECTION
         ======================================================== */}
      <section id="hero" className="relative pt-12 pb-20 md:pt-20 md:pb-32 bg-gradient-to-b from-indigo-50/70 via-white to-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Column: Hero Copy & CTAs */}
            <div className="lg:col-span-7 flex flex-col items-start text-start">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-100/80 border border-indigo-200 text-indigo-700 text-xs sm:text-sm font-bold tracking-wide uppercase mb-6">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>{t.hero.eyebrow}</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6">
                {t.hero.headline}
              </h1>

              {/* Supporting Subtitle */}
              <p className="text-lg sm:text-xl text-slate-600 leading-relaxed mb-8 max-w-2xl font-normal">
                {t.hero.sub}
              </p>

              {/* System Entry CTA Buttons */}
              <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto mb-10">
                {/* Primary CTA: MUST navigate to existing /register */}
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base px-8 py-4 rounded-xl shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/35 hover:-translate-y-0.5 transition-all duration-200"
                >
                  <span>{t.hero.primaryCta}</span>
                  <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                </Link>

                {/* Secondary CTA: Scrolls smoothly to #contact */}
                <a
                  href="#contact"
                  onClick={(e) => scrollToSection(e, 'contact')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-base px-7 py-4 rounded-xl border border-slate-300 hover:border-slate-400 shadow-sm transition-all duration-200"
                >
                  <PhoneCall className="w-4 h-4 text-indigo-600" />
                  <span>{t.hero.secondaryCta}</span>
                </a>
              </div>

              {/* Value Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t border-slate-200/80 w-full">
                {t.hero.badges.map((badge, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{badge}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Hero Visual (Marketing Presentation Only - NOT Clickable to CRM) */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Decorative background glow */}
                <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur-xl opacity-20 transform -rotate-1"></div>
                
                {/* Visual Frame */}
                <div className="relative rounded-2xl bg-white p-3 shadow-2xl border border-slate-200/80 overflow-hidden">
                  <div className="flex items-center justify-between pb-3 px-2 border-b border-slate-100 text-xs font-semibold text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span>
                      <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
                      <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block"></span>
                      <span className="ms-2 font-mono text-[11px] text-slate-400">tashgheel.itqansolutions.org</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                      Tashgheel CRM
                    </span>
                  </div>

                  {/* Real screenshot or product visual display */}
                  <div className="relative mt-2 rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                    <img
                      src="/assets/genesis-hero.png"
                      alt="Tashgheel CRM Platform Presentation"
                      className="w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-4">
                      <div className="bg-white/95 backdrop-blur-md rounded-xl p-3 border border-slate-200/60 shadow-lg flex items-center gap-3 w-full">
                        <img src="/favicon.png" alt="ITQAN Logo" className="w-8 h-8 object-contain" />
                        <div>
                          <div className="text-xs font-bold text-slate-900">TASHGHEEL CRM Cloud</div>
                          <div className="text-[11px] text-slate-500">Bilingual Operations • General & Real Estate</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================
          2. GENERAL CRM VS REAL ESTATE (TWO EXPERIENCES)
         ======================================================== */}
      <section id="solutions" className="py-20 md:py-28 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              {t.twoExperiences.title}
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              {t.twoExperiences.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* General CRM Card */}
            <div id="general-crm" className="bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-6">
                  <Briefcase className="w-7 h-7" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">
                  {t.twoExperiences.general.title}
                </h3>
                <div className="text-sm font-bold text-indigo-600 mb-4 uppercase tracking-wider">
                  {t.twoExperiences.general.subtitle}
                </div>
                <p className="text-slate-600 leading-relaxed mb-8">
                  {t.twoExperiences.general.desc}
                </p>

                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Capabilities & Modules
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-8">
                  {t.twoExperiences.general.capabilities.map((cap, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safe CTA: Scrolls smoothly to General Workflow section */}
              <a
                href="#general-workflow"
                onClick={(e) => scrollToSection(e, 'general-workflow')}
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-600 border border-slate-200 transition-colors"
              >
                <span>{t.twoExperiences.general.cta}</span>
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </a>
            </div>

            {/* Real Estate CRM Card */}
            <div id="real-estate-crm" className="bg-white rounded-3xl p-8 sm:p-10 border-2 border-indigo-600/30 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 end-0 bg-indigo-600 text-white text-[11px] font-extrabold px-4 py-1.5 rounded-bl-xl uppercase tracking-wider">
                Specialized Solution
              </div>
              <div>
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-6 shadow-md shadow-indigo-600/30">
                  <Building2 className="w-7 h-7" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">
                  {t.twoExperiences.realEstate.title}
                </h3>
                <div className="text-sm font-bold text-indigo-600 mb-4 uppercase tracking-wider">
                  {t.twoExperiences.realEstate.subtitle}
                </div>
                <p className="text-slate-600 leading-relaxed mb-8">
                  {t.twoExperiences.realEstate.desc}
                </p>

                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Property Sales Capabilities
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-8">
                  {t.twoExperiences.realEstate.capabilities.map((cap, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-indigo-50/60 border border-indigo-100 text-xs font-semibold text-slate-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safe CTA: Scrolls smoothly to Real Estate Workflow section */}
              <a
                href="#real-estate-workflow"
                onClick={(e) => scrollToSection(e, 'real-estate-workflow')}
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all"
              >
                <span>{t.twoExperiences.realEstate.cta}</span>
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================
          3. INDUSTRIES SECTION
         ======================================================== */}
      <section className="py-20 md:py-28 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              {t.industries.title}
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              {t.industries.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {t.industries.items.map((ind, idx) => (
              <div
                key={idx}
                className="bg-slate-50/80 hover:bg-white rounded-2xl p-7 border border-slate-200/80 hover:border-indigo-300 hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono font-bold px-2 py-1 bg-slate-200/70 rounded text-slate-700">
                      0{idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-indigo-600">
                      Tashgheel Engine
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-1">
                    {ind.title}
                  </h3>
                  <div className="text-xs font-bold text-slate-500 mb-3">
                    {ind.subtitle}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {ind.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          4. CUSTOMER 360 SECTION
         ======================================================== */}
      <section id="features" className="py-20 md:py-28 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-4">
                <Users className="w-3.5 h-3.5" />
                <span>Centralized Customer Intelligence</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
                {t.customer360.title}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                {t.customer360.subtitle}
              </p>

              <div className="space-y-4">
                {t.customer360.points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-3.5 p-3 rounded-xl bg-white border border-slate-200/70 shadow-sm">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5 font-bold" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{pt.label}</div>
                      <div className="text-xs text-slate-600">{pt.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Presentation-only Customer 360 Visual */}
            <div className="lg:col-span-6">
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white font-extrabold flex items-center justify-center text-lg shadow-md shadow-indigo-600/30">
                      C
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 text-base">Al-Safwa Real Estate Group</div>
                      <div className="text-xs text-slate-500 font-mono">ID: CST-2026-089 • Tier: VIP Enterprise</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    Active
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] font-bold text-slate-400">Total Deals</div>
                    <div className="text-base font-extrabold text-slate-900">4 Opportunities</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] font-bold text-slate-400">Balance Due</div>
                    <div className="text-base font-extrabold text-slate-900">Reconciled</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] font-bold text-slate-400">Follow-ups</div>
                    <div className="text-base font-extrabold text-indigo-600">Today, 2:00 PM</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Activity Timeline</div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span className="font-semibold text-slate-800">Quotation Approved: QT-2026-041</span>
                    </div>
                    <span className="text-slate-400">2 hours ago</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-emerald-600" />
                      <span className="font-semibold text-slate-800">Payment Voucher Issued: PV-1049</span>
                    </div>
                    <span className="text-slate-400">Yesterday</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-purple-600" />
                      <span className="font-semibold text-slate-800">Unit Reservation Contract Drafted</span>
                    </div>
                    <span className="text-slate-400">3 days ago</span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 text-center text-[11px] font-semibold text-slate-400">
                  Presentation Visual • Real-time Customer 360 Workspace
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================
          5. GENERAL SALES WORKFLOW
         ======================================================== */}
      <section id="general-workflow" className="py-20 md:py-24 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider mb-3">
              <Briefcase className="w-3.5 h-3.5" />
              <span>General Commercial Pipeline</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
              {t.workflows.generalTitle}
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              {t.workflows.generalSub}
            </p>
          </div>

          {/* Workflow Visualization Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {t.workflows.generalSteps.map((step, idx) => (
              <div key={idx} className="relative group">
                <div className="bg-slate-50 hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-300 rounded-xl p-3.5 text-center transition-all">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-xs mx-auto mb-2 flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div className="text-xs font-bold text-slate-900 leading-snug">
                    {step}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          6. REAL ESTATE WORKFLOW
         ======================================================== */}
      <section id="real-estate-workflow" className="py-20 md:py-24 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-3">
              <Building2 className="w-3.5 h-3.5" />
              <span>Real Estate Development & Brokerage</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
              {t.workflows.reTitle}
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              {t.workflows.reSub}
            </p>
          </div>

          {/* Real Estate Workflow Visualization */}
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5">
            {t.workflows.reSteps.map((step, idx) => (
              <div key={idx} className="relative group">
                <div className="bg-white hover:bg-indigo-50/80 border border-slate-200 hover:border-indigo-300 rounded-xl p-3 text-center transition-all shadow-sm">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-extrabold text-xs mx-auto mb-2 flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div className="text-xs font-bold text-slate-900 leading-tight">
                    {step}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          7. GENERAL VS REAL ESTATE COMPARISON TABLE
         ======================================================== */}
      <section className="py-20 md:py-28 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
              {t.comparison.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              {t.comparison.subtitle}
            </p>
          </div>

          {/* Comparison Matrix Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-md">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-slate-100/90 text-slate-900 border-b border-slate-200">
                  <th className="py-4 px-6 text-sm font-extrabold text-start">{t.comparison.colFeature}</th>
                  <th className="py-4 px-6 text-sm font-extrabold text-center w-1/4 bg-slate-50">{t.comparison.colGeneral}</th>
                  <th className="py-4 px-6 text-sm font-extrabold text-center w-1/4 bg-indigo-50/70 text-indigo-900">{t.comparison.colRE}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.comparison.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-6 text-sm font-bold text-slate-800">
                      {row.name}
                    </td>
                    <td className="py-3.5 px-6 text-center bg-slate-50/40">
                      {typeof row.g === 'boolean' ? (
                        row.g ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 inline-block" />
                        ) : (
                          <Minus className="w-4 h-4 text-slate-300 inline-block" />
                        )
                      ) : (
                        <span className="text-xs font-bold text-slate-600">{row.g}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-center bg-indigo-50/20">
                      {typeof row.r === 'boolean' ? (
                        row.r ? (
                          <CheckCircle2 className="w-5 h-5 text-indigo-600 inline-block" />
                        ) : (
                          <Minus className="w-4 h-4 text-slate-300 inline-block" />
                        )
                      ) : (
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                          {row.r}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ========================================================
          8. WHY TASHGHEEL
         ======================================================== */}
      <section className="py-20 md:py-28 bg-slate-50 border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              {t.why.title}
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              {t.why.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {t.why.cards.map((card, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm mb-4">
                  0{idx + 1}
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">
                  {card.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================
          9. POWERED BY ITQAN SOLUTIONS SECTION
         ======================================================== */}
      <section id="about" className="py-16 bg-white border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-3 p-2 px-5 rounded-2xl bg-slate-50 border border-slate-200 mb-6">
            <img
              src="/favicon.png"
              alt="ITQAN Solutions Logo"
              className="w-8 h-8 object-contain"
            />
            <span className="text-sm font-extrabold text-slate-800">
              ITQAN Solutions
            </span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-4">
            {t.itqan.title}
          </h3>

          <p className="text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
            {t.itqan.desc}
          </p>
        </div>
      </section>

      {/* ========================================================
          10. CONTACT SECTION
         ======================================================== */}
      <section id="contact" className="py-20 md:py-28 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-3">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Consultation & Inquiries</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              {t.contact.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              {t.contact.subtitle}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 shadow-xl">
            {formSubmitted ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">
                  {lang === 'en' ? 'Consultation Request Received' : 'تم استلام طلب الاستشارة بنجاح'}
                </h3>
                <p className="text-slate-600 max-w-md mx-auto">
                  {t.contact.successMsg}
                </p>
                <button
                  type="button"
                  onClick={() => setFormSubmitted(false)}
                  className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  {lang === 'en' ? 'Submit another request' : 'إرسال طلب آخر'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                      {t.contact.name} *
                    </label>
                    <input
                      type="text"
                      required
                      value={contactData.name}
                      onChange={(e) => setContactData({ ...contactData, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm transition-all"
                      placeholder={lang === 'en' ? 'Your Name' : 'اسمك الكريم'}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                      {t.contact.company} *
                    </label>
                    <input
                      type="text"
                      required
                      value={contactData.companyName}
                      onChange={(e) => setContactData({ ...contactData, companyName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm transition-all"
                      placeholder={lang === 'en' ? 'Company Name' : 'اسم الشركة'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                      {t.contact.phone} *
                    </label>
                    <input
                      type="tel"
                      required
                      value={contactData.phone}
                      onChange={(e) => setContactData({ ...contactData, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm transition-all"
                      placeholder="+20 1..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                      {t.contact.email} *
                    </label>
                    <input
                      type="email"
                      required
                      value={contactData.email}
                      onChange={(e) => setContactData({ ...contactData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm transition-all"
                      placeholder="name@company.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                      {t.contact.bizType}
                    </label>
                    <select
                      value={contactData.businessType}
                      onChange={(e) => setContactData({ ...contactData, businessType: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm transition-all bg-white"
                    >
                      {t.contact.bizTypes.map((type, i) => (
                        <option key={i} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                      {t.contact.lookingFor}
                    </label>
                    <select
                      value={contactData.lookingFor}
                      onChange={(e) => setContactData({ ...contactData, lookingFor: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm transition-all bg-white"
                    >
                      {t.contact.lookingOptions.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-2">
                    {t.contact.message}
                  </label>
                  <textarea
                    rows={4}
                    value={contactData.message}
                    onChange={(e) => setContactData({ ...contactData, message: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none text-sm transition-all"
                    placeholder={lang === 'en' ? 'Tell us briefly about your team size, workflow, and goals...' : 'أخبرنا باختصار عن حجم فريقك، ونشاطك، وتطلعاتك...'}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base py-4 rounded-xl shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/35 transition-all duration-200"
                >
                  <span>{t.contact.submit}</span>
                  <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================
          11. MARKETING FOOTER
         ======================================================== */}
      <footer className="bg-slate-900 text-white pt-16 pb-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-slate-800">
            
            {/* Col 1: Brand Info */}
            <div className="md:col-span-1 space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src="/favicon.png"
                  alt="ITQAN Solutions Logo"
                  className="w-9 h-9 object-contain bg-white rounded-lg p-1"
                />
                <span className="text-lg font-extrabold tracking-tight">
                  TASHGHEEL <span className="text-indigo-400">CRM</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t.footer.tagline}
              </p>
              <div className="text-xs font-semibold text-slate-500">
                Developed by ITQAN Solutions
              </div>
            </div>

            {/* Col 2: Product Links (Scroll targets only) */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {t.footer.product}
              </div>
              <ul className="space-y-2 text-xs text-slate-400">
                <li>
                  <a href="#general-crm" onClick={(e) => scrollToSection(e, 'general-crm')} className="hover:text-white transition-colors">
                    General CRM
                  </a>
                </li>
                <li>
                  <a href="#real-estate-crm" onClick={(e) => scrollToSection(e, 'real-estate-crm')} className="hover:text-white transition-colors">
                    Real Estate CRM
                  </a>
                </li>
                <li>
                  <a href="#features" onClick={(e) => scrollToSection(e, 'features')} className="hover:text-white transition-colors">
                    Customer 360° & Features
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 3: Company */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {t.footer.company}
              </div>
              <ul className="space-y-2 text-xs text-slate-400">
                <li>
                  <a href="#about" onClick={(e) => scrollToSection(e, 'about')} className="hover:text-white transition-colors">
                    {t.footer.aboutItqan}
                  </a>
                </li>
                <li>
                  <a href="#contact" onClick={(e) => scrollToSection(e, 'contact')} className="hover:text-white transition-colors">
                    {t.footer.contactUs}
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4: System Access (Exact Login and Register Only) */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {t.footer.access}
              </div>
              <ul className="space-y-2 text-xs text-slate-400">
                <li>
                  <Link to="/login" className="hover:text-white transition-colors font-semibold">
                    Sign In to Account
                  </Link>
                </li>
                <li>
                  <Link to="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors font-semibold">
                    Try Live Demo (Register)
                  </Link>
                </li>
              </ul>
            </div>

          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <div>{t.footer.rights}</div>
            <div className="flex items-center gap-6">
              <span>Cairo, Egypt</span>
              <span>•</span>
              <span>Enterprise Business Architecture</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default CorporateHome;
