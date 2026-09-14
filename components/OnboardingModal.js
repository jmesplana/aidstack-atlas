import React, { useEffect, useState } from 'react';

const STEPS = [
  {
    icon: '📂',
    title: 'Upload your site data',
    description: 'Prepare a CSV with columns: name, latitude, longitude. Add any extra columns (population, coverage_rate, facility_type) for richer AI analysis. Open the Data Hub drawer to upload.',
    cta: 'Download CSV template',
    ctaAction: 'template',
  },
  {
    icon: '🗺️',
    title: 'Review live disaster & security data',
    description: 'GDACS disaster alerts load automatically. For ACLED, download a CSV export using your ACLED account, then upload it into the app to enable conflict overlays and country filtering. You can also upload an admin boundary shapefile (.zip) for area-level risk views.',
    cta: null,
  },
  {
    icon: '👥',
    title: 'Add WorldPop population data',
    description: 'Toggle WorldPop integration to overlay high-resolution population statistics with age-sex breakdowns. Identify vulnerable populations (under-5, over-60) in disaster-affected areas.',
    cta: null,
  },
  {
    icon: '🎯',
    title: 'Assess campaign viability',
    description: 'Get GO/CAUTION/DELAY/NOGO decisions for each site or administrative area. Batch-assess 1000+ sites at once to prioritize safe operations and identify high-risk areas.',
    cta: null,
  },
  {
    icon: '🔮',
    title: 'Monitor risks & early warnings',
    description: 'Get disease outbreak risk indicators (Cholera, Malaria, Measles) based on weather and disaster conditions. Monitor 14-day hazard forecasts and supply chain disruption warnings.',
    cta: null,
  },
  {
    icon: '🤖',
    title: 'Chat, analyze & export reports',
    description: 'Click any site marker for AI recommendations. Use the chatbot with real-time web search to ask questions. Generate Situation Reports and export decision briefs as HTML/PDF.',
    cta: null,
  },
];

export default function OnboardingModal({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCta = () => {
    if (current.ctaAction === 'template') {
      const csv = [
        'name,latitude,longitude,facility_type,population',
        'Example Health Post,1.2345,32.6789,health_post,5000',
        'Example Warehouse,-1.5000,30.1000,warehouse,0',
        'Example Clinic,2.0000,31.5000,clinic,12000',
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'site_template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(15,23,42,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
    }}
    onClick={onClose}
    >
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '36px',
        maxWidth: '460px',
        width: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}
      onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <div style={{
              fontSize: '11px', fontWeight: 600, color: '#FF6B35',
              letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px',
              fontFamily: "'Inter', sans-serif",
            }}>
              Getting started
            </div>
            <h2 style={{
              margin: 0, fontSize: '20px', fontWeight: 700,
              color: '#1A365D', fontFamily: "'Space Grotesk', sans-serif",
            }}>
              Welcome to Aidstack Atlas
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Intelligence for impact workers
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '22px', color: '#94A3B8', lineHeight: 1, padding: '0', marginTop: '-2px',
          }}>×</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '28px' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              onClick={() => i < step && setStep(i)}
              style={{
                flex: 1, height: '4px', borderRadius: '2px',
                cursor: i < step ? 'pointer' : 'default',
                background: i <= step ? '#FF6B35' : '#E2E8F0',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Current step content */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '44px', marginBottom: '14px' }}>{current.icon}</div>
          <div style={{
            fontSize: '11px', fontWeight: 600, color: '#94A3B8',
            letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px',
          }}>
            Step {step + 1} of {STEPS.length}
          </div>
          <h3 style={{
            margin: '0 0 10px', fontSize: '17px', fontWeight: 600,
            color: '#0F172A', fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {current.title}
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.65' }}>
            {current.description}
          </p>
        </div>

        {current.cta && (
          <button onClick={handleCta} style={{
            display: 'block', width: '100%', marginBottom: '12px',
            background: 'transparent',
            border: '1px solid #1A365D',
            color: '#1A365D', borderRadius: '6px', padding: '10px',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}>
            {current.cta}
          </button>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                flex: 1, background: '#F1F5F9', border: 'none', borderRadius: '6px',
                padding: '12px', fontSize: '14px', fontWeight: 600,
                color: '#475569', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                flex: 1, background: '#FF6B35', border: 'none', borderRadius: '6px',
                padding: '12px', fontSize: '14px', fontWeight: 700,
                color: 'white', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}
            >
              Next
            </button>
          ) : (
            <button
              onClick={onClose}
              style={{
                flex: 1, background: '#1A365D', border: 'none', borderRadius: '6px',
                padding: '12px', fontSize: '14px', fontWeight: 700,
                color: 'white', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}
            >
              Get started
            </button>
          )}
        </div>

        <div style={{ marginTop: '14px', textAlign: 'center' }}>
          <a
            href="/landing"
            style={{
              display: 'inline-block',
              marginBottom: '10px',
              fontSize: '13px',
              color: '#1A365D',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            View full landing guide
          </a>
        </div>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', color: '#94A3B8', fontFamily: "'Inter', sans-serif",
            }}
          >
            Skip — I know what I&apos;m doing
          </button>
        </div>
      </div>
    </div>
  );
}
