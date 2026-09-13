import Link from 'next/link';
import { useState, useEffect } from 'react';
import LandingWorkspaceApps from './LandingWorkspaceApps';

const LandingPage = () => {
  const [openFaq, setOpenFaq] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  // Slow down iframe content after it loads
  useEffect(() => {
    const slowDownIframe = (iframeId) => {
      const iframe = document.getElementById(iframeId);
      if (!iframe) return;

      const slowDownVideo = () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const videos = iframeDoc.querySelectorAll('video');
          videos.forEach(video => {
            video.playbackRate = 0.75; // Slow down to 75% speed
          });
        } catch (e) {
          // Cross-origin restriction, can't access iframe content
          console.log('Cannot slow down video due to cross-origin restrictions');
        }
      };

      iframe.addEventListener('load', slowDownVideo);
      // Try immediately in case already loaded
      slowDownVideo();

      return () => iframe.removeEventListener('load', slowDownVideo);
    };

    const cleanup1 = slowDownIframe('intro-iframe-embed');
    const cleanup2 = slowDownIframe('intro-iframe-fullscreen');

    return () => {
      cleanup1?.();
      cleanup2?.();
    };
  }, [isFullscreen]);
  const experimentalBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '10px',
    padding: '4px 8px',
    borderRadius: '999px',
    background: '#FEF3C7',
    color: '#92400E',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    verticalAlign: 'middle'
  };

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse0 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes pulse1 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }
        @keyframes pulse2 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes pulse3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.12); }
        }
        @keyframes pulse4 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.08); }
        }

        @media (max-width: 1024px) {
          .landing-header-inner {
            gap: 16px;
          }

          .hero-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }

          .hero-title {
            font-size: 44px !important;
          }

          .hero-preview {
            transform: none !important;
          }
        }

        @media (max-width: 768px) {
          .landing-header-inner {
            flex-direction: column;
            align-items: flex-start;
          }

          .hero-section {
            padding: 40px 16px 56px !important;
          }

          .hero-title {
            font-size: 34px !important;
          }

          .hero-copy {
            text-align: left;
          }

          .hero-stats {
            grid-template-columns: 1fr !important;
            max-width: none !important;
          }

          .hero-preview {
            padding: 14px !important;
          }
        }
      `}</style>
      {/* Navigation Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #E5E7EB',
        padding: '16px 0',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
      }}>
        <div className="landing-header-inner" style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {/* Logo */}
          <Link href="/landing">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              gap: '12px'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
              <div>
                <div style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: '24px',
                  color: '#1A365D',
                  lineHeight: 1
                }}>
                  Aidstack <span style={{ color: '#475569' }}>Disasters</span>
                </div>
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '11px',
                  color: '#94A3B8',
                  letterSpacing: '0.5px',
                  marginTop: '2px'
                }}>
                  Operational intelligence for field teams
                </div>
              </div>
            </div>
          </Link>

          {/* CTA Button */}
          <Link href="/app">
            <button style={{
              background: '#FF6B35',
              color: 'white',
              border: 'none',
              padding: '12px 28px',
              borderRadius: '8px',
              fontSize: '15px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px rgba(255, 107, 53, 0.25)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 8px rgba(255, 107, 53, 0.25)';
            }}
            >
              Launch App →
            </button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section" style={{
        background: 'linear-gradient(135deg, #1A365D 0%, #2D5A7B 100%)',
        padding: '60px 20px 80px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>

        <div className="hero-grid" style={{
          maxWidth: '1200px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 500px), 1fr))',
          gap: '60px',
          alignItems: 'center'
        }}>
          <div className="hero-copy" style={{ textAlign: 'left' }}>
            {/* Trust Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 107, 53, 0.15)',
              border: '1px solid rgba(255, 107, 53, 0.3)',
              borderRadius: '20px',
              padding: '6px 14px',
              marginBottom: '24px'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                background: '#10B981',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'pulse 2s ease-in-out infinite'
              }}></span>
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                color: 'white'
              }}>
                Live GDACS & WHO, Uploaded ACLED
              </span>
            </div>

            <h1 className="hero-title" style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '56px',
              lineHeight: '1.1',
              color: 'white',
              marginBottom: '24px',
              letterSpacing: '-0.02em'
            }}>
              Geospatial Operational Intelligence
              <br />
              <span style={{
                background: 'linear-gradient(90deg, #FF6B35 0%, #FFA366 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                for Crisis, Health, and Field Operations
              </span>
            </h1>
            <p style={{
              fontSize: '20px',
              lineHeight: '1.7',
              color: 'rgba(255, 255, 255, 0.85)',
              marginBottom: '32px',
              maxWidth: '540px'
            }}>
              Monitor disasters, outbreaks and access constraints in one map workspace. Open focused apps to plan immunization sessions, track outbreak response, and turn your data into source-linked briefings.
            </p>
            <div style={{
              display: 'inline-flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
              marginBottom: '24px',
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: '12px',
              color: 'rgba(255, 255, 255, 0.92)',
              fontSize: '13px',
              lineHeight: '1.5',
              maxWidth: '560px'
            }}>
              <span style={{
                padding: '3px 8px',
                borderRadius: '999px',
                background: '#FEF3C7',
                color: '#92400E',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}>
                Evidence-Gated
              </span>
              <span>Forecast, outlook and prioritization show the evidence behind hazard scores. Workspace apps keep plans, source dates and response decisions available for review.</span>
            </div>
            <a href="#workspace-apps" style={{ display: 'inline-block', color: '#FFD2BF', marginBottom: '24px', fontWeight: 600 }}>Explore workspace apps →</a>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '40px' }}>
              <Link href="/app">
                <button style={{
                  background: '#FF6B35',
                  color: 'white',
                  border: 'none',
                  padding: '16px 36px',
                  borderRadius: '10px',
                  fontSize: '17px',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 16px rgba(255, 107, 53, 0.4)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 20px rgba(255, 107, 53, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 16px rgba(255, 107, 53, 0.4)';
                }}
                >
                  Launch App →
                </button>
              </Link>
              <a href="https://github.com/jmesplana" target="_blank" rel="noopener noreferrer">
                <button style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '16px 36px',
                  borderRadius: '10px',
                  fontSize: '17px',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(10px)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.2)';
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }}
                >
                  View on GitHub
                </button>
              </a>
            </div>

            {/* Quick stats/use cases */}
            <div className="hero-stats" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '20px',
              maxWidth: '600px'
            }}>
              {[
                { number: 'Admin-First', label: 'Analysis Workflow' },
                { number: '1000+', label: 'Site Assessments' },
                { number: 'Auditable', label: 'Hazard Evidence' }
              ].map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '16px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)'
                }}>
                  <span style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#FF6B35',
                    fontFamily: "'Space Grotesk', sans-serif"
                  }}>
                    {item.number}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.95)',
                    fontFamily: "'Inter', sans-serif",
                    textAlign: 'center'
                  }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* App Preview - Right Side */}
          <div className="hero-preview" style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '20px',
            padding: '20px',
            boxShadow: '0 25px 70px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            transform: 'perspective(1000px) rotateY(-5deg)',
            transition: 'transform 0.3s ease'
          }}>
            <div style={{
              background: '#F3F4F6',
              borderRadius: '12px 12px 0 0',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid #E5E7EB'
            }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#FF6B35' }}></div>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#FFC107' }}></div>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10B981' }}></div>
              </div>
              <div style={{
                flex: 1,
                background: 'white',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                color: '#94A3B8',
                fontFamily: "'Inter', sans-serif"
              }}>
                disasters.aidstack.ai/app
              </div>
            </div>

            <div style={{
              background: '#F8FAFC',
              borderRadius: '0 0 12px 12px',
              overflow: 'hidden',
              minHeight: '600px'
            }}>
              <div style={{
                background: 'white',
                padding: '14px 16px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2.5">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                  </svg>
                  <div>
                    <div style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontWeight: 700,
                      fontSize: '14px',
                      color: '#1A365D'
                    }}>
                      Aidstack Disasters
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: '#64748B',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      Live hazards with site impact context
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <div style={{
                    background: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    color: '#047857',
                    padding: '5px 8px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    211 safe
                  </div>
                  <div style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    padding: '5px 8px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    34 impacted
                  </div>
                </div>
              </div>

              <div style={{
                position: 'relative',
                height: '530px',
                background: 'linear-gradient(135deg, #D9E7D7 0%, #D3E1EF 38%, #E3D9D0 100%)',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0.08,
                  backgroundImage: 'radial-gradient(circle at 20% 30%, #1A365D 0, transparent 26%), radial-gradient(circle at 72% 18%, #1A365D 0, transparent 24%), linear-gradient(135deg, rgba(255,255,255,0.2) 0, transparent 60%)'
                }}></div>

                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                  <path d="M 62 120 L 180 82 L 252 150 L 218 252 L 108 270 L 56 204 Z" fill="rgba(148, 163, 184, 0.1)" stroke="rgba(26,54,93,0.28)" strokeWidth="2" />
                  <path d="M 238 92 L 372 72 L 462 158 L 422 276 L 298 292 L 222 206 Z" fill="rgba(239, 68, 68, 0.16)" stroke="#EF4444" strokeWidth="2.5" />
                  <path d="M 118 294 L 258 278 L 314 390 L 212 472 L 86 430 L 72 342 Z" fill="rgba(251, 191, 36, 0.14)" stroke="rgba(217, 119, 6, 0.65)" strokeWidth="2" />
                </svg>

                <div style={{
                  position: 'absolute',
                  top: '18px',
                  left: '18px',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  zIndex: 2
                }}>
                  {[
                    { label: 'Flood corridor', color: '#F97316' },
                    { label: 'WHO reports', color: '#BE185D' },
                    { label: 'WorldPop active', color: '#1D4ED8' }
                  ].map((chip) => (
                    <div key={chip.label} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(255,255,255,0.92)',
                      borderRadius: '999px',
                      padding: '6px 10px',
                      boxShadow: '0 6px 16px rgba(15,23,42,0.08)',
                      fontSize: '10px',
                      color: '#334155',
                      fontWeight: 700,
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: chip.color
                      }}></span>
                      {chip.label}
                    </div>
                  ))}
                </div>

                {[
                  { top: '24%', left: '65%', color: '#EF4444', label: 'Flood' },
                  { top: '34%', left: '58%', color: '#F97316', label: 'Bridge risk' },
                  { top: '58%', left: '31%', color: '#BE185D', label: 'WHO' }
                ].map((marker, idx) => (
                  <div key={idx} style={{
                    position: 'absolute',
                    top: marker.top,
                    left: marker.left,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 2
                  }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: marker.color,
                      opacity: 0.18,
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)'
                    }}></div>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: marker.color,
                      border: '2px solid white',
                      boxShadow: '0 8px 18px rgba(15,23,42,0.18)',
                      position: 'relative',
                      zIndex: 1
                    }}></div>
                    <div style={{
                      position: 'absolute',
                      top: '-24px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'white',
                      padding: '4px 8px',
                      borderRadius: '999px',
                      fontSize: '9px',
                      fontWeight: 700,
                      color: '#334155',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 6px 18px rgba(15,23,42,0.12)',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      {marker.label}
                    </div>
                  </div>
                ))}

                {[
                  { top: '27%', left: '60%', impacted: true },
                  { top: '31%', left: '69%', impacted: true },
                  { top: '40%', left: '54%', impacted: false },
                  { top: '45%', left: '73%', impacted: true },
                  { top: '61%', left: '24%', impacted: false },
                  { top: '67%', left: '33%', impacted: false },
                ].map((facility, idx) => (
                  <div key={idx} style={{
                    position: 'absolute',
                    top: facility.top,
                    left: facility.left,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3
                  }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      background: facility.impacted ? '#EF4444' : '#10B981',
                      border: '2px solid white',
                      boxShadow: '0 4px 10px rgba(15,23,42,0.18)',
                      borderRadius: '3px'
                    }}></div>
                  </div>
                ))}

                <div style={{
                  position: 'absolute',
                  left: '18px',
                  bottom: '18px',
                  width: '190px',
                  background: 'rgba(255,255,255,0.94)',
                  borderRadius: '14px',
                  padding: '14px',
                  boxShadow: '0 14px 28px rgba(15,23,42,0.12)',
                  zIndex: 3
                }}>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#94A3B8',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    Map Focus
                  </div>
                  <div style={{
                    fontSize: '17px',
                    fontWeight: 700,
                    color: '#1A365D',
                    marginBottom: '6px',
                    fontFamily: "'Space Grotesk', sans-serif"
                  }}>
                    Northern River Belt
                  </div>
                  <div style={{
                    fontSize: '12px',
                    lineHeight: '1.6',
                    color: '#475569',
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    34 sites within the current hazard corridor. Priority admin areas are highlighted for the next 72 hours.
                  </div>
                </div>

                <div style={{
                  position: 'absolute',
                  right: '18px',
                  top: '18px',
                  width: '235px',
                  background: 'rgba(255,255,255,0.96)',
                  borderRadius: '16px',
                  boxShadow: '0 18px 40px rgba(15,23,42,0.16)',
                  overflow: 'hidden',
                  zIndex: 3
                }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #1A365D 0%, #2D5A7B 100%)',
                    padding: '14px 16px',
                    color: 'white'
                  }}>
                    <div style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontWeight: 700,
                      fontSize: '14px',
                      marginBottom: '4px'
                    }}>
                      AI Brief
                    </div>
                    <div style={{
                      fontSize: '10px',
                      opacity: 0.9,
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      Selected hotspot: River transport corridor
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      marginBottom: '14px'
                    }}>
                      {[
                        { label: 'Sites', value: '34', color: '#EF4444' },
                        { label: 'Areas', value: '5', color: '#F97316' },
                        { label: 'Risk', value: 'High', color: '#7C3AED' }
                      ].map((item) => (
                        <div key={item.label} style={{
                          background: '#F8FAFC',
                          borderRadius: '10px',
                          padding: '8px',
                          textAlign: 'center'
                        }}>
                          <div style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: item.color,
                            fontFamily: "'Space Grotesk', sans-serif"
                          }}>
                            {item.value}
                          </div>
                          <div style={{
                            fontSize: '9px',
                            color: '#64748B',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            fontFamily: "'Inter', sans-serif"
                          }}>
                            {item.label}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#1A365D',
                      marginBottom: '8px',
                      fontFamily: "'Space Grotesk', sans-serif"
                    }}>
                      Recommended next move
                    </div>
                    <div style={{
                      background: '#FFF7ED',
                      border: '1px solid #FED7AA',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '11px',
                      lineHeight: '1.55',
                      color: '#7C2D12',
                      marginBottom: '12px',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      Enable Flood Context, review logistics coverage, and pre-position mobile teams west of the flood corridor before road access drops.
                    </div>

                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '11px',
                      color: '#475569',
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      <div>Flood readiness: <strong>Ready</strong></div>
                      <div>Conflict incidents in nearby districts: <strong>3</strong></div>
                      <div>Population in affected catchment: <strong>184K</strong></div>
                    </div>
                  </div>
                </div>

                <div style={{
                  position: 'absolute',
                  right: '18px',
                  bottom: '18px',
                  left: '228px',
                  background: 'rgba(255,255,255,0.94)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  zIndex: 3
                }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#FFEDD5'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      height: '5px',
                      background: '#E2E8F0',
                      borderRadius: '999px',
                      position: 'relative',
                      marginBottom: '6px'
                    }}>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        width: '54%',
                        background: 'linear-gradient(90deg, #FB923C 0%, #EF4444 100%)',
                        borderRadius: '999px'
                      }}></div>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      color: '#64748B',
                      fontWeight: 600,
                      fontFamily: "'Inter', sans-serif"
                    }}>
                      <span>Playback: last 72 hours</span>
                      <span>Mar 19 - Mar 22</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingWorkspaceApps />

      {/* Video Demo Section */}
      <section style={{
        padding: '80px 20px',
        background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
        position: 'relative'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#FFF7ED',
              border: '1px solid #FED7AA',
              borderRadius: '20px',
              padding: '6px 14px',
              marginBottom: '20px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                fontWeight: 700,
                color: '#9A3412',
                letterSpacing: '0.04em',
                textTransform: 'uppercase'
              }}>
                See It In Action
              </span>
            </div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '42px',
              color: '#1A365D',
              marginBottom: '16px',
              letterSpacing: '-0.02em'
            }}>
              Watch How It Works
            </h2>
            <p style={{
              fontSize: '18px',
              lineHeight: '1.7',
              color: '#64748B',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              From uploading boundaries to getting AI-powered operational recommendations in seconds
            </p>
          </div>

          <div style={{
            position: 'relative',
            maxWidth: '960px',
            margin: '0 auto'
          }}>
            <div style={{
              position: 'relative',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 70px rgba(26, 54, 93, 0.15)',
              background: '#0A0F1A',
              aspectRatio: '16 / 9'
            }}>
              <iframe
                id="intro-iframe-embed"
                src={hasUserInteracted ? "/intro.html" : "about:blank"}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                  borderRadius: '16px',
                  opacity: hasUserInteracted ? 1 : 0,
                  transition: 'opacity 0.5s ease'
                }}
                title="Aidstack Disasters Interactive Demo"
                allow="autoplay; fullscreen"
              />

              {/* Play overlay - shows before user interaction */}
              {!hasUserInteracted && (
                <div
                  onClick={() => setHasUserInteracted(true)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #1A365D 0%, #2D5A7B 100%)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #2D5A7B 0%, #1A365D 100%)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #1A365D 0%, #2D5A7B 100%)';
                  }}
                >
                  <div style={{
                    textAlign: 'center',
                    color: 'white'
                  }}>
                    <div style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '50%',
                      background: 'rgba(255, 107, 53, 0.95)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px',
                      boxShadow: '0 8px 32px rgba(255, 107, 53, 0.4)',
                      transition: 'transform 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                      </svg>
                    </div>
                    <div style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: '24px',
                      fontWeight: 700,
                      marginBottom: '8px'
                    }}>
                      Watch Interactive Demo
                    </div>
                    <div style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '16px',
                      color: 'rgba(255, 255, 255, 0.8)'
                    }}>
                      Click to play
                    </div>
                  </div>
                </div>
              )}

              {/* Fullscreen button */}
              <button
                onClick={() => setIsFullscreen(true)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: "'Inter', sans-serif",
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.3s ease',
                  zIndex: 10
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255, 107, 53, 0.9)';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(255, 107, 53, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(0, 0, 0, 0.7)';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
                Fullscreen
              </button>
            </div>
          </div>

          {/* Fullscreen Modal */}
          {isFullscreen && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(10, 15, 26, 0.98)',
                backdropFilter: 'blur(10px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                animation: 'fadeIn 0.3s ease'
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setIsFullscreen(false);
              }}
            >
              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '1400px',
                height: '90vh',
                background: '#0A0F1A',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 25px 100px rgba(0, 0, 0, 0.5)'
              }}>
                <iframe
                  id="intro-iframe-fullscreen"
                  src="/intro.html"
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: 'block'
                  }}
                  title="Aidstack Disasters Interactive Demo - Fullscreen"
                  allow="autoplay; fullscreen"
                />

                {/* Close button */}
                <button
                  onClick={() => setIsFullscreen(false)}
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'rgba(0, 0, 0, 0.8)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    color: 'white',
                    fontSize: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                    zIndex: 10
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(239, 68, 68, 0.9)';
                    e.target.style.transform = 'scale(1.1) rotate(90deg)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'rgba(0, 0, 0, 0.8)';
                    e.target.style.transform = 'scale(1) rotate(0deg)';
                  }}
                  aria-label="Close fullscreen"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>

                {/* Exit fullscreen hint */}
                <div style={{
                  position: 'absolute',
                  bottom: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '20px',
                  padding: '8px 16px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '13px',
                  fontFamily: "'Inter', sans-serif",
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <kbd style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600
                  }}>ESC</kbd>
                  or click outside to exit fullscreen
                </div>
              </div>
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            marginTop: '32px',
            flexWrap: 'wrap'
          }}>
            <Link href="/app">
              <button style={{
                background: '#FF6B35',
                color: 'white',
                border: 'none',
                padding: '14px 32px',
                borderRadius: '10px',
                fontSize: '16px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 16px rgba(255, 107, 53, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(255, 107, 53, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 16px rgba(255, 107, 53, 0.3)';
              }}
              >
                Try It Now →
              </button>
            </Link>
            <a href="https://github.com/jmesplana/gdacs_ai" target="_blank" rel="noopener noreferrer">
              <button style={{
                background: 'white',
                color: '#1A365D',
                border: '2px solid #E2E8F0',
                padding: '14px 32px',
                borderRadius: '10px',
                fontSize: '16px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#CBD5E1';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#E2E8F0';
                e.target.style.transform = 'translateY(0)';
              }}
              >
                View Source Code
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Value Proposition Section */}
      <section style={{
        padding: '80px 20px',
        background: 'white'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '42px',
            textAlign: 'center',
            color: '#1A365D',
            marginBottom: '60px'
          }}>
            From Situation Awareness to Response Planning
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: '40px'
          }}>
            {/* Benefit 1 */}
            <div style={{
              background: '#F8FAFC',
              padding: '32px',
              borderRadius: '12px',
              border: '1px solid #94A3B8'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                background: '#1A365D',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                </svg>
              </div>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                color: '#0F172A',
                marginBottom: '12px'
              }}>
                Real-Time Awareness
              </h3>
              <ul style={{
                color: '#475569',
                fontSize: '16px',
                lineHeight: '1.8',
                paddingLeft: '20px'
              }}>
                <li>Live GDACS disaster data</li>
                <li>CAP XML polygon impact zones</li>
                <li>WHO outbreak report mapping</li>
                <li>ACLED CSV upload support</li>
                <li>Automatic updates every refresh</li>
              </ul>
            </div>

            {/* Benefit 2 */}
            <div style={{
              background: '#F8FAFC',
              padding: '32px',
              borderRadius: '12px',
              border: '1px solid #94A3B8'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                background: '#1A365D',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                color: '#0F172A',
                marginBottom: '12px'
              }}>
                Instant Impact Assessment
              </h3>
              <ul style={{
                color: '#475569',
                fontSize: '16px',
                lineHeight: '1.8',
                paddingLeft: '20px'
              }}>
                <li>Upload sites via CSV or Excel</li>
                <li>Upload shapefiles for admin boundaries</li>
                <li>Select admin areas before running analysis</li>
                <li>Scope all analysis to the uploaded boundaries</li>
              </ul>
            </div>

            {/* Benefit 3 */}
            <div style={{
              background: '#F8FAFC',
              padding: '32px',
              borderRadius: '12px',
              border: '1px solid #94A3B8'
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                background: '#1A365D',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                color: '#0F172A',
                marginBottom: '12px'
              }}>
                Auditable Decision Support
              </h3>
              <ul style={{
                color: '#475569',
                fontSize: '16px',
                lineHeight: '1.8',
                paddingLeft: '20px'
              }}>
                <li>Operational Outlook grounded in structured evidence</li>
                <li>Prioritization Board for selected admin areas</li>
                <li>Flood and Drought Context overlays from Google Earth Engine</li>
                <li>District hazard scores with visible drivers and sources</li>
                <li>Operation viability (GO/CAUTION/DELAY/NOGO)</li>
                <li>Chat and decision views share the same admin-level context</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Advanced Features Section */}
      <section id="features" style={{
        padding: '100px 20px',
        background: 'linear-gradient(135deg, #1A365D 0%, #2D5A7B 100%)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.05,
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <div style={{
              display: 'inline-block',
              background: 'rgba(255, 107, 53, 0.2)',
              border: '1px solid rgba(255, 107, 53, 0.4)',
              color: 'white',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              marginBottom: '20px',
              fontFamily: "'Inter', sans-serif"
            }}>
              COMPREHENSIVE FEATURE SET
            </div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '48px',
              color: 'white',
              marginBottom: '20px',
              letterSpacing: '-0.01em'
            }}>
              Everything You Need for <span style={{ color: '#FF6B35' }}>Data-Driven Decisions</span>
            </h2>
            <p style={{
              fontSize: '20px',
              color: 'rgba(255, 255, 255, 0.85)',
              maxWidth: '700px',
              margin: '0 auto',
              lineHeight: '1.7'
            }}>
              Combine map-based monitoring and admin-area analysis with workspace apps for immunization planning, outbreak evidence, response actions and briefings.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: '28px'
          }}>
            {[
              {
                title: 'WorldPop Integration',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                description: 'Google Earth Engine-powered population statistics with age-sex breakdowns',
                features: [
                  'Real-time population heatmaps',
                  'Vulnerable population identification (under-5, over-60)',
                  'Age-sex demographic breakdowns',
                  'Area-level population statistics'
                ]
              },
              {
                title: 'OSM Infrastructure & Logistics',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
                description: 'OpenStreetMap infrastructure data integration for logistics and access assessment with confidence scoring',
                features: [
                  'Auto-loads when districts are uploaded',
                  '8+ infrastructure categories (hospitals, schools, roads, bridges, water, power, fuel, airports)',
                  'Logistics and access assessment',
                  'Route safety analysis',
                  'Infrastructure coverage scoring',
                  'Multi-tier caching (Redis + IndexedDB)'
                ]
              },
              {
                title: 'Admin-Level Decision Views',
                experimental: true,
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>,
                description: 'Forecast, operational outlook, and prioritization all use the same selected admin areas and shared hazard evidence',
                features: [
                  'Admin-level forecast scoring',
                  'Operational Outlook with evidence-linked narrative',
                  'Prioritization Board for selected admin areas',
                  'Shared drivers, sources, and limitations',
                  'Choropleth styling with 7 color palettes',
                  'Quantile/equal-interval classification',
                  'Custom dataset field visualization'
                ]
              },
              {
                title: 'Trend Analysis Dashboard',
                experimental: true,
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
                description: 'Temporal pattern analysis across disasters, conflict events, and site risk over configurable time windows',
                features: [
                  'ACLED event trends over time',
                  'Disaster timeline visualization',
                  'Site risk score trends',
                  'District comparison tables',
                  'AI-powered narrative insights',
                  'Configurable time windows (7/30/90 days)'
                ]
              },
              {
                title: 'Operation Viability Assessment',
                experimental: true,
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
                description: 'GO/CAUTION/DELAY/NOGO decisions for field operations at site or batch level',
                features: [
                  'Multi-site batch assessment',
                  'Area-level operation readiness',
                  'Operation-specific risk scoring',
                  'HTML/PDF decision brief export'
                ]
              },
              {
                title: 'Nighttime Lights Compare',
                experimental: true,
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/><path d="M4 12h16"/></svg>,
                description: 'Compare two VIIRS monthly night-light composites with a before/after swipe directly on the map',
                features: [
                  'Visible month labels for both dates',
                  'Before/after vertical swipe control',
                  'Monthly VIIRS history through Google Earth Engine',
                  'Supports district context and anomaly review'
                ]
              },
              {
                title: 'Environmental Intelligence Layers',
                experimental: true,
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>,
                description: 'Six Google Earth Engine overlays for environmental and accessibility context analysis',
                features: [
                  'Nighttime lights (VIIRS) - population/infrastructure visibility',
                  'Recent clear imagery (Sentinel-2) - last 10 days terrain view',
                  'Radar change detection (Sentinel-1) - flood detection through clouds',
                  'Healthcare accessibility (Oxford MAP) - travel time analysis',
                  'Flood context - terrain + surface water baseline',
                  'Drought context - CHIRPS rainfall + ERA5 heat',
                  'Configurable opacity for overlay blending'
                ]
              },
              {
                title: 'Advanced Security Analysis',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                description: 'Security risk scoring from uploaded ACLED CSV exports with proximity zones',
                features: [
                  'Upload ACLED CSV files downloaded from your ACLED account',
                  'Filter uploaded events by country in-app',
                  'Security zones (0-10km, 10-25km, 25-50km, 50-100km)',
                  'CRITICAL/HIGH/MEDIUM/LOW classifications',
                  'Incident aggregation by zone'
                ]
              },
              {
                title: 'Drawing & Annotation Tools',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
                description: 'Freehand drawing tools for operational planning',
                features: [
                  'Customizable colors',
                  'Area measurement',
                  'Route planning',
                  'Annotation persistence'
                ]
              },
              {
                title: 'Timeline Visualization',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                description: 'Replay disaster evolution with adjustable playback speed',
                features: [
                  'Progressive event visualization',
                  'Speed control (0.5x to 2x)',
                  'Play/pause animation',
                  'Temporal pattern analysis'
                ]
              },
              {
                title: 'AI Chatbot with Web Search',
                experimental: true,
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/></svg>,
                description: 'Context-aware AI assistant with real-time information',
                features: [
                  'Real-time web search integration',
                  'Admin area interaction intents',
                  'Streaming responses',
                  'Context-aware recommendations'
                ]
              },
              {
                title: 'Disaster Risk Monitoring',
                experimental: true,
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
                description: 'Admin-level hazard screening with visible drivers, readiness gates, and evidence-linked scoring',
                features: [
                  'Flood, drought, and heat hazard views',
                  'Scores withheld until required layers are enabled',
                  'Drivers, sources, and limitations shown for every result',
                  'Shared evidence across forecast, outlook, and prioritization'
                ]
              },
              {
                title: 'Multiple Basemap Options',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
                description: 'Switch between standard basemaps and Earth Engine visual layers for context review',
                features: [
                  'OpenStreetMap standard view',
                  'Satellite imagery',
                  'Terrain visualization',
                  'Nighttime lights with date compare'
                ]
              },
              {
                title: 'Multiple Operation Types',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/></svg>,
                description: 'Pre-configured analysis templates for crisis response, health, and field operations',
                features: [
                  'Immunization campaigns',
                  'Malaria control',
                  'WASH interventions',
                  'Mental health & psychosocial support',
                  'Nutrition/RUTF distribution',
                  'Disease surveillance'
                ]
              },
              {
                title: 'Persistent Workspace Storage',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
                description: 'Keep loaded map context, app plans and outbreak snapshots in your browser workspace',
                features: [
                  'Save app plans and outbreak snapshots on this device',
                  'Districts, WorldPop, OSM, and ACLED cached automatically',
                  'Storage statistics dashboard with clear controls',
                  'Restores loaded context after refresh',
                  'Reopen saved work in the same browser and workspace'
                ]
              },
              {
                title: 'Outbreak Evidence & Response Tracking',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>,
                description: 'Review dated observations, source coverage and response decisions in the Outbreak Response app',
                features: [
                  'National and area-level trends kept separate',
                  'Data coverage and missing-source prompts',
                  'Response indicators and coordinator actions',
                  'Snapshot comparisons and reviewed briefings'
                ]
              },
              {
                title: 'Export & Reporting',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
                description: 'Export map assessments, app plans and outbreak briefings for operational review',
                features: [
                  'Outbreak HTML, Markdown and print-to-PDF briefings',
                  'SVG maps/charts and evidence JSON',
                  'Immunization planning workbooks and JSON backups',
                  'Site decision briefs and situation reports'
                ]
              }
            ].map((feature, idx) => (
              <div key={idx} style={{
                background: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                padding: '32px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 107, 53, 0.5)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              >
                <div style={{ marginBottom: '16px' }}>
                  {feature.icon}
                </div>
                <h3 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: '22px',
                  color: 'white',
                  marginBottom: '12px'
                }}>
                  {feature.title}
                  {feature.experimental && (
                    <span style={experimentalBadgeStyle}>Experimental</span>
                  )}
                </h3>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '15px',
                  lineHeight: '1.7',
                  marginBottom: '20px'
                }}>
                  {feature.description}
                </p>
                <ul style={{
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '14px',
                  lineHeight: '2',
                  paddingLeft: 0,
                  margin: 0,
                  listStyle: 'none'
                }}>
                  {feature.features.map((item, i) => (
                    <li key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section style={{
        padding: '80px 20px',
        background: '#F8FAFC'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
            gap: '60px',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '36px',
                color: '#1A365D',
                marginBottom: '24px'
              }}>
                The Challenge
              </h2>
              <p style={{
                fontSize: '18px',
                lineHeight: '1.8',
                color: '#475569',
                marginBottom: '20px'
              }}>
                Response teams, public health programs, and field operations groups struggle to see which areas, sites, and routes are exposed when hazards, outbreaks, conflict, and access constraints overlap. Manual monitoring across multiple data sources slows operational decisions.
              </p>
            </div>
            <div>
              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '36px',
                color: '#1A365D',
                marginBottom: '24px'
              }}>
                The Solution
              </h2>
              <p style={{
                fontSize: '18px',
                lineHeight: '1.8',
                color: '#475569',
                marginBottom: '32px'
              }}>
                Aidstack Disasters connects map-based monitoring, admin-area evidence and AI decision support with focused workspace apps. Teams can assess exposure, build immunization session plans, track outbreak response and export briefings from the same workspace.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px'
              }}>
                <div style={{
                  background: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  border: '1px solid #94A3B8'
                }}>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    color: '#FF6B35',
                    marginBottom: '8px'
                  }}>100+</div>
                  <div style={{ fontSize: '14px', color: '#475569' }}>Disasters Monitored</div>
                </div>
                <div style={{
                  background: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  border: '1px solid #94A3B8'
                }}>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    color: '#FF6B35',
                    marginBottom: '8px'
                  }}>1,000+</div>
                  <div style={{ fontSize: '14px', color: '#475569' }}>Sites Assessed</div>
                </div>
                <div style={{
                  background: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  border: '1px solid #94A3B8'
                }}>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: 700,
                    color: '#FF6B35',
                    marginBottom: '8px'
                  }}>&lt;30s</div>
                  <div style={{ fontSize: '14px', color: '#475569' }}>AI Analysis Time</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operational Use Cases Section */}
      <section id="use-cases" style={{
        padding: '100px 20px',
        background: 'linear-gradient(180deg, #F8FAFC 0%, white 100%)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <div style={{
              display: 'inline-block',
              background: '#FF6B35',
              color: 'white',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              marginBottom: '20px',
              fontFamily: "'Inter', sans-serif"
            }}>
              ONE PLATFORM, MULTIPLE OPERATIONS
            </div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '48px',
              color: '#0F172A',
              marginBottom: '20px',
              letterSpacing: '-0.01em'
            }}>
              Purpose-Built for <span style={{ color: '#FF6B35' }}>Operational Excellence</span>
            </h2>
            <p style={{
              fontSize: '20px',
              color: '#475569',
              maxWidth: '700px',
              margin: '0 auto',
              lineHeight: '1.7'
            }}>
              Use the map for shared operational context, then open workspace apps for detailed immunization planning and outbreak response.
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))',
            gap: '28px'
          }}>
            {[
              {
                title: 'Immunization Campaigns',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2l4 4M7.5 12.5l-4 4M4.5 16.5L2 19l3 3 2.5-2.5M9 6l6 6M16.5 7.5l3-3L22 7l-3 3"/><path d="M7 7l9 9"/></svg>,
                description: 'Build an immunization plan from settlement data and uploaded boundaries, with coverage gaps, session allocations and resource estimates',
                features: ['Coverage and settlement gaps', 'Session dates, teams and delivery', 'Dose and team-day estimates', 'Scenario copies and planning workbooks'],
                example: 'Allocate children to sessions, review team capacity and export a workbook with source data and assumptions'
              },
              {
                title: 'Cholera/OCV Response',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
                description: 'Review flood context, WHO outbreak reports, population exposure, and nearby infrastructure for OCV and WASH planning',
                features: ['Flood context review', 'WHO outbreak visibility', 'OCV prioritization', 'Emergency response targeting'],
                example: 'Identify selected admin areas where flood context and outbreak reports require closer coordination'
              },
              {
                title: 'Humanitarian Access',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
                description: 'Assess access constraints with uploaded ACLED events, OSM logistics layers, and admin-area risk scoring',
                features: ['Uploaded ACLED events', 'Security proximity zones', 'Logistics layer review', 'Access constraint notes'],
                example: 'Flag selected admin areas where recent uploaded conflict events raise field movement concerns'
              },
              {
                title: 'Supply Chain Risk',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
                description: 'Compare warehouses, roads, airports, fuel points, hazards, and conflict signals before pre-positioning decisions',
                features: ['Pre-positioning recommendations', 'Infrastructure coverage review', 'Hazard exposure screening', 'Multi-signal analysis'],
                example: 'Review which selected admin areas have logistics gaps before a forecast or current hazard escalates'
              },
              {
                title: 'Outbreak Response',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
                description: 'Open the Outbreak Response app to combine aggregate case trends, mobility context and dated operational indicators with a response plan',
                features: ['Aggregate data imports and source dates', 'Area trends and mobility connections', 'Response indicators and assigned actions', 'Saved snapshots and leadership briefings'],
                example: 'Review changes since a saved snapshot, assign response actions and export a source-linked coordination briefing'
              },
              {
                title: 'Multi-Sector Assessment',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
                description: 'Integrated analysis across health, WASH, protection, and shelter with weather-aware forward-looking scenarios',
                features: ['Operational Outlook', 'Weather-integrated planning', 'Timeline playback analysis', 'Early warning indicators'],
                example: 'Generate operational outlook with weather forecasts to plan campaigns for the next 2 weeks'
              },
              {
                title: 'Malaria Control',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z"/><path d="M12 6v6l4 2"/></svg>,
                description: 'ITN distribution planning with admin boundaries, flood context, population exposure, and logistics review',
                features: ['Environmental context review', 'Population exposure screening', 'Distribution site assessment', 'Flood impact on ITN campaigns'],
                example: 'Identify selected admin areas where population exposure and access constraints should shape ITN planning'
              },
              {
                title: 'WASH Interventions',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
                description: 'Water point vulnerability and emergency WASH needs assessment',
                features: ['Flood-affected water point mapping', 'Contamination risk zones', 'Emergency latrine needs calculation', 'Hygiene kit distribution planning'],
                example: 'Calculate emergency WASH needs for flood-affected admin areas with damaged water infrastructure'
              },
              {
                title: 'Mental Health & Psychosocial Support',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
                description: 'Trauma-affected population mapping and service gap analysis',
                features: ['Conflict-affected area prioritization', 'Service coverage gap analysis', 'Safe space site selection', 'Counselor deployment planning'],
                example: 'Identify admin areas with high conflict exposure and no MHPSS services'
              },
              {
                title: 'Nutrition/RUTF Distribution',
                icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>,
                description: 'Nutrition/RUTF planning with drought context, access constraints, site data, and population exposure',
                features: ['Drought context review', 'RUTF access constraint assessment', 'Distribution site accessibility', 'Admin-area prioritization'],
                example: 'Prioritize drought-affected admin areas where access and population exposure create delivery risk'
              }
            ].map((useCase, idx) => (
              <div key={idx} style={{
                background: 'white',
                border: '2px solid #E5E7EB',
                borderRadius: '16px',
                padding: '36px',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(255, 107, 53, 0.15)';
                e.currentTarget.style.transform = 'translateY(-6px)';
                e.currentTarget.style.borderColor = '#FF6B35';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#E5E7EB';
              }}
              >
                <div style={{
                  marginBottom: '20px',
                  lineHeight: 1
                }}>
                  {useCase.icon}
                </div>
                <h3 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: '24px',
                  color: '#1A365D',
                  marginBottom: '12px'
                }}>
                  {useCase.title}
                </h3>
                <p style={{
                  color: '#64748B',
                  fontSize: '15px',
                  lineHeight: '1.7',
                  marginBottom: '20px'
                }}>
                  {useCase.description}
                </p>
                <ul style={{
                  color: '#475569',
                  fontSize: '14px',
                  lineHeight: '2',
                  paddingLeft: 0,
                  margin: 0,
                  marginBottom: '20px',
                  listStyle: 'none'
                }}>
                  {useCase.features.map((item, i) => (
                    <li key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
                {useCase.example && (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    background: '#F8FAFC',
                    borderLeft: '3px solid #FF6B35',
                    borderRadius: '6px'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      color: '#FF6B35',
                      fontWeight: 700,
                      letterSpacing: '0.5px',
                      marginBottom: '4px',
                      textTransform: 'uppercase'
                    }}>
                      Example Query
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#475569',
                      lineHeight: '1.6',
                      fontStyle: 'italic'
                    }}>
                      "{useCase.example}"
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Data Flexibility Section */}
      <section style={{
        padding: '100px 20px',
        background: 'white'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <div style={{
              display: 'inline-block',
              background: '#1A365D',
              color: 'white',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              marginBottom: '20px',
              fontFamily: "'Inter', sans-serif"
            }}>
              DATA-AGNOSTIC APPROACH
            </div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '48px',
              color: '#0F172A',
              marginBottom: '20px',
              letterSpacing: '-0.01em'
            }}>
              Upload <span style={{ color: '#FF6B35' }}>Any Data</span>, Get Instant Intelligence
            </h2>
            <p style={{
              fontSize: '20px',
              color: '#475569',
              maxWidth: '700px',
              margin: '0 auto',
              lineHeight: '1.7'
            }}>
              No custom development needed. Upload any CSV with coordinates and select which columns to analyze.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
            gap: '24px',
            marginBottom: '60px'
          }}>
            {[
              {
                step: '1',
                title: 'Upload Your Data',
                description: 'Any CSV with lat/long: sites, vaccination posts, warehouses, disease cases, etc.',
                icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              },
              {
                step: '2',
                title: 'Select AI Fields',
                description: 'Choose columns for AI analysis: population, coverage, cases, refusals, partner, etc.',
                icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
              },
              {
                step: '3',
                title: 'Add Context Layers',
                description: 'Upload ACLED CSV exports and admin boundaries for area-level risk assessment and country filtering',
                icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              },
              {
                step: '4',
                title: 'Ask Questions',
                description: 'Natural language queries: "Which admin areas need catch-up campaigns?"',
                icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              }
            ].map((step, idx) => (
              <div key={idx} style={{
                background: '#F8FAFC',
                padding: '28px',
                borderRadius: '12px',
                border: '2px solid #E5E7EB',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '20px',
                  background: '#FF6B35',
                  color: 'white',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px'
                }}>
                  {step.step}
                </div>
                <div style={{ marginBottom: '12px' }}>{step.icon}</div>
                <h4 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: '18px',
                  color: '#1A365D',
                  marginBottom: '8px'
                }}>
                  {step.title}
                </h4>
                <p style={{
                  fontSize: '14px',
                  color: '#64748B',
                  lineHeight: '1.6',
                  margin: 0
                }}>
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          {/* Visual Guide */}
          <div style={{
            background: 'linear-gradient(135deg, #1A365D 0%, #2D4A7C 100%)',
            borderRadius: '16px',
            padding: '48px',
            color: 'white'
          }}>
            <h3 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: '28px',
              marginBottom: '32px',
              textAlign: 'center'
            }}>
              Visual Differentiation at a Glance
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
              gap: '32px'
            }}>
              {[
                {
                  label: 'Sites',
                  shape: 'square',
                  colors: [
                    { label: 'Safe', color: '#4CAF50' },
                    { label: 'Impacted', color: '#ff4444' }
                  ],
                  description: 'Square markers'
                },
                {
                  label: 'ACLED Events',
                  shape: 'circle',
                  colors: [
                    { label: 'Battles', color: '#d32f2f' },
                    { label: 'Violence', color: '#ff6f00' },
                    { label: 'Protests', color: '#fbc02d' }
                  ],
                  description: 'Circular markers'
                },
                {
                  label: 'Admin Area Risk',
                  shape: 'polygon',
                  colors: [
                    { label: 'None', color: '#4A90E2' },
                    { label: 'Low', color: '#7cb342' },
                    { label: 'Medium', color: '#fdd835' },
                    { label: 'High', color: '#fb8c00' },
                    { label: 'Very High', color: '#e53935' }
                  ],
                  description: 'Filled polygons'
                }
              ].map((item, idx) => (
                <div key={idx} style={{
                  textAlign: 'left',
                  padding: '20px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  minHeight: '100%'
                }}>
                  <div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      marginBottom: '6px',
                      fontFamily: "'Space Grotesk', sans-serif"
                    }}>
                      {item.label}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontStyle: 'italic'
                    }}>
                      {item.description}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    fontSize: '12px',
                    color: 'rgba(255, 255, 255, 0.9)'
                  }}>
                    {item.colors.map((colorItem, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '8px 10px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '12px',
                            height: '12px',
                            background: colorItem.color,
                            borderRadius: item.shape === 'circle' ? '50%' : item.shape === 'square' ? '2px' : '1px',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            flexShrink: 0
                          }}></div>
                          <span>{colorItem.label}</span>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          color: 'rgba(255, 255, 255, 0.55)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          flexShrink: 0
                        }}>
                          {item.shape}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Use Cases Section */}
      <section style={{
        padding: '80px 20px',
        background: '#1A365D'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '42px',
            textAlign: 'center',
            color: 'white',
            marginBottom: '60px'
          }}>
            Operational Intelligence for Every Stage of Response
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '32px'
          }}>
            {[
              {
                title: 'Response Organizations',
                description: 'Protect field staff by identifying high-risk areas before deployment'
              },
              {
                title: 'Emergency Response Teams',
                description: 'Prioritize which sites need immediate assistance during multi-disaster events'
              },
              {
                title: 'Public Health Programs',
                description: 'Plan campaigns and surveillance around outbreaks, population exposure, access, and security'
              },
              {
                title: 'Field Operations Teams',
                description: 'Determine operation feasibility by analyzing security, hazard, infrastructure, and access risks'
              }
            ].map((useCase, idx) => (
              <div key={idx} style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                padding: '32px',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                <div style={{
                  width: '8px',
                  height: '40px',
                  background: '#FF6B35',
                  borderRadius: '4px',
                  marginBottom: '20px'
                }}></div>
                <h3 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: '22px',
                  color: 'white',
                  marginBottom: '12px'
                }}>
                  {useCase.title}
                </h3>
                <p style={{
                  color: '#94A3B8',
                  fontSize: '16px',
                  lineHeight: '1.7',
                  margin: 0
                }}>
                  {useCase.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" style={{
        padding: '80px 20px',
        background: 'white'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '42px',
            textAlign: 'center',
            color: '#1A365D',
            marginBottom: '60px'
          }}>
            From Data to Decision in Five Steps
          </h2>
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: '23px',
              top: '30px',
              bottom: '30px',
              width: '2px',
              background: '#FF6B35'
            }}></div>

            {[
              {
                title: 'Load Live Disasters, Conflict, and Boundaries',
                description: 'Access live GDACS disaster data, upload ACLED CSV exports from your ACLED account, and upload a shapefile with the administrative boundaries you want to analyze'
              },
              {
                title: 'Select Admin Areas and Add Context',
                description: 'Choose the admin areas that matter, then load sites, WorldPop population, OSM infrastructure, optional hazard context overlays, and nighttime lights when needed'
              },
              {
                title: 'Choose Your Analysis or Workspace App',
                description: 'Use forecast, outlook and prioritization with the required evidence layers, or open Apps on the map to install and launch Immunization planning or Outbreak Response'
              },
              {
                title: 'Build and Review Your Plan',
                description: 'Import the data your app needs. Review coverage gaps and session resources, or outbreak trends, source dates and response actions. Add owners and operational assumptions before briefing your team'
              },
              {
                title: 'Save, Export and Brief Your Team',
                description: 'Save plans or outbreak snapshots in this browser workspace. Export a planning workbook or a source-linked outbreak briefing, with charts and maps for review and coordination'
              }
            ].map((step, idx) => (
              <div key={idx} style={{
                display: 'flex',
                gap: '24px',
                marginBottom: idx < 4 ? '40px' : '0',
                position: 'relative'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  background: '#1A365D',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '4px solid white',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <span style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: '20px',
                    color: '#FF6B35'
                  }}>
                    {idx + 1}
                  </span>
                </div>
                <div style={{
                  background: '#F8FAFC',
                  padding: '24px',
                  borderRadius: '12px',
                  flex: 1
                }}>
                  <h3 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: '20px',
                    color: '#0F172A',
                    marginBottom: '8px'
                  }}>
                    {step.title}
                  </h3>
                  <p style={{
                    color: '#475569',
                    fontSize: '16px',
                    lineHeight: '1.7',
                    margin: 0
                  }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Sources Section */}
      <section style={{
        padding: '80px 20px',
        background: '#F8FAFC'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '42px',
            textAlign: 'center',
            color: '#1A365D',
            marginBottom: '60px'
          }}>
            Trusted Global Data Sources
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: '32px'
          }}>
            {/* GDACS */}
            <div style={{
              background: 'white',
              padding: '36px',
              borderRadius: '12px',
              border: '1px solid #94A3B8'
            }}>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                color: '#1A365D',
                marginBottom: '12px'
              }}>
                GDACS
              </h3>
              <p style={{
                fontSize: '13px',
                color: '#94A3B8',
                marginBottom: '18px',
                fontStyle: 'italic'
              }}>
                Global Disaster Alert and Coordination System
              </p>
              <ul style={{
                color: '#475569',
                fontSize: '15px',
                lineHeight: '1.8',
                paddingLeft: '20px',
                margin: 0
              }}>
                <li>UN-backed disaster monitoring</li>
                <li>7 disaster types tracked</li>
                <li>Updated continuously</li>
                <li>CAP XML precision polygons</li>
              </ul>
              <div style={{ marginTop: '20px' }}>
                <a
                  href="https://www.gdacs.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#1A365D',
                    fontSize: '14px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  Visit GDACS
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>

            {/* ACLED */}
            <div style={{
              background: 'white',
              padding: '36px',
              borderRadius: '12px',
              border: '1px solid #94A3B8'
            }}>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                color: '#1A365D',
                marginBottom: '12px'
              }}>
                ACLED
              </h3>
              <p style={{
                fontSize: '13px',
                color: '#94A3B8',
                marginBottom: '18px',
                fontStyle: 'italic'
              }}>
                Armed Conflict Location & Event Data Project
              </p>
              <ul style={{
                color: '#475569',
                fontSize: '15px',
                lineHeight: '1.8',
                paddingLeft: '20px',
                margin: 0
              }}>
                <li>CSV exports downloaded with your ACLED account</li>
                <li>Upload into the app for conflict overlays</li>
                <li>Filter uploaded events by country</li>
                <li>Geo-coded event precision</li>
              </ul>
              <div style={{ marginTop: '20px' }}>
                <a
                  href="https://acleddata.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#1A365D',
                    fontSize: '14px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  Get ACLED data
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>

            {/* WHO */}
            <div style={{
              background: 'white',
              padding: '36px',
              borderRadius: '12px',
              border: '1px solid #94A3B8'
            }}>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                color: '#1A365D',
                marginBottom: '12px'
              }}>
                WHO
              </h3>
              <p style={{
                fontSize: '13px',
                color: '#94A3B8',
                marginBottom: '18px',
                fontStyle: 'italic'
              }}>
                Disease Outbreak News
              </p>
              <ul style={{
                color: '#475569',
                fontSize: '15px',
                lineHeight: '1.8',
                paddingLeft: '20px',
                margin: 0
              }}>
                <li>Outbreak reports loaded from WHO</li>
                <li>Map features expanded by reported locations</li>
                <li>Date filtering with background backfill</li>
                <li>Included in sitrep and admin-area context</li>
              </ul>
              <div style={{ marginTop: '20px' }}>
                <a
                  href="https://www.who.int/emergencies/disease-outbreak-news"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#1A365D',
                    fontSize: '14px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  Visit WHO outbreak news
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>

            {/* WorldPop */}
            <div style={{
              background: 'white',
              padding: '36px',
              borderRadius: '12px',
              border: '1px solid #94A3B8'
            }}>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                color: '#1A365D',
                marginBottom: '12px'
              }}>
                WorldPop
              </h3>
              <p style={{
                fontSize: '13px',
                color: '#94A3B8',
                marginBottom: '18px',
                fontStyle: 'italic'
              }}>
                WorldPop Global 2 via Google Earth Engine
              </p>
              <ul style={{
                color: '#475569',
                fontSize: '15px',
                lineHeight: '1.8',
                paddingLeft: '20px',
                margin: 0
              }}>
                <li>High-resolution population grids</li>
                <li>Age and sex disaggregation</li>
                <li>Global coverage</li>
                <li>App supports 2015-2030 WorldPop years</li>
              </ul>
              <p style={{
                marginTop: '18px',
                marginBottom: 0,
                fontSize: '13px',
                lineHeight: '1.6',
                color: '#64748B'
              }}>
                This app uses WorldPop Global 2 collections through Google Earth Engine, including total population and age-sex layers across the 2015-2030 range.
              </p>
              <div style={{
                marginTop: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <a
                  href="https://www.worldpop.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#1A365D',
                    fontSize: '14px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  Visit WorldPop
                  <span aria-hidden="true">↗</span>
                </a>
                <a
                  href="https://gee-community-catalog.org/projects/worldpop/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#1A365D',
                    fontSize: '14px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  View exact GEE collections used
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section style={{
        padding: '80px 20px',
        background: 'white'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '42px',
            textAlign: 'center',
            color: '#1A365D',
            marginBottom: '60px'
          }}>
            Common Questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              {
                question: 'What is the App Hub and how do I open it?',
                answer: 'Launch the workspace and select Apps on the map. Install and open the included Immunization planning or Outbreak Response app. Each app uses the workspace data it needs and saves its plans separately. Immunization planning requires uploaded administrative boundaries; Outbreak Response can start with tables and trends before you add boundaries for maps.'
              },
              {
                question: 'Can I add my own workspace app?',
                answer: 'Yes. In Workspace apps, choose Add app and upload a compatible app ZIP. Review the author, version, requested access and required data, then confirm installation. The hub includes a downloadable example. Installed apps and saved plans stay in this browser and workspace; disabling an app retains its plans.'
              },
              {
                question: 'Can Outbreak Response work with my own data?',
                answer: 'Yes. Start a new outbreak and import aggregate CSV, Excel or flat JSON data, then map the location, reporting date, value, units and measure type. You can also upload movement connections and operational indicators, or use the DRC public-source preset. Connected sources refresh when the app opens, while uploaded data must be replaced manually. Saved snapshots keep their recorded observations until you refresh. Export a reviewed briefing as HTML or Markdown, print to PDF, or export evidence JSON and individual SVG visuals.'
              },
              {
                question: 'What is the Operational Outlook feature?',
                answer: 'Operational Outlook is the narrative decision layer. It explains what is changing in the selected admin areas, why those areas matter, what evidence was used, and what operational implications follow from the shared hazard analysis.'
              },
              {
                question: 'How does WorldPop integration work?',
                answer: 'The platform integrates Google Earth Engine to provide population statistics including total population, age-sex breakdowns, and vulnerable population counts (under-5, over-60). Population heatmaps visualize demographic density across your operational area, helping identify high-impact zones for interventions.'
              },
              {
                question: 'What is Operation Viability Assessment?',
                answer: 'Operation Viability provides GO/CAUTION/DELAY/NOGO decisions for field operations. You can assess individual sites or batch-process 1000+ sites simultaneously. The system evaluates security risks, disaster impacts, accessibility, and population data to generate decision briefs exportable as HTML/PDF.'
              },
              {
                question: 'How does weather forecast integration work?',
                answer: 'The platform uses weather forecasts together with the admin areas from your uploaded shapefile. Forecast alone is not enough for every hazard: flood and drought scoring only run when the required evidence layers are enabled, and the outputs show drivers, sources, and limitations.'
              },
              {
                question: 'What is Timeline Playback?',
                answer: 'Timeline Playback lets you replay disasters and conflict events over time with adjustable speed controls (0.5x to 2x). Watch how disasters evolved, identify progression patterns, and understand temporal relationships between events. Perfect for after-action reviews and historical analysis.'
              },
              {
                question: 'How does the AI use real-time web search?',
                answer: 'The AI assistant can search the web for current crisis events, public health guidance, access constraints, and breaking developments to supplement the loaded data. This is secondary to the in-app evidence and should still be reviewed by an operator before action.'
              },
              {
                question: 'What are the drawing tools used for?',
                answer: 'Drawing tools allow you to annotate maps with freehand drawings, measure areas, plan routes, and mark zones of interest. Choose custom colors for different annotations and persist drawings across sessions for ongoing operational planning.'
              },
              {
                question: 'How does security risk scoring work with ACLED data?',
                answer: 'Download an ACLED CSV export using your ACLED account, upload it into the app, and then filter the uploaded events by country. The platform uses those uploaded conflict events to create proximity zones (0-10km, 10-25km, 25-50km, 50-100km) around sites and classify security levels based on incident type, recency, and proximity.'
              },
              {
                question: 'Can I batch-assess multiple sites?',
                answer: 'Absolutely. Upload CSV files with 1000+ sites and run batch operation-viability assessments. The system processes all sites simultaneously and generates individual decision briefs plus a system-wide readiness report, helping prioritize which locations to operate in.'
              },
              {
                question: 'What operation types are supported?',
                answer: 'Pre-configured templates exist for Immunization, Cholera/OCV, Malaria Control, WASH, Mental Health & Psychosocial Support, Nutrition/RUTF Distribution, and Disease Surveillance. Each template has operation-specific risk factors and decision criteria.'
              },
              {
                question: 'Can I use my own site data?',
                answer: 'Yes. Upload any CSV or Excel file with name, latitude, and longitude columns. You can also upload shapefiles for administrative boundaries, then select the admin areas you want to analyze before running forecast, outlook, prioritization, or operation decision workflows.'
              },
              {
                question: 'How does nighttime lights comparison work?',
                answer: 'Switch the basemap to Nighttime Lights (GEE), turn on compare mode, and choose a before and after month. The map will show a vertical swipe line so you can compare two VIIRS monthly composites directly. The AI only uses nighttime-lights context when that layer is actually loaded.'
              },
              {
                question: 'Is my data stored on servers?',
                answer: 'Uploaded site data, admin boundaries, selected districts, WorldPop summaries, OSM data, and uploaded ACLED events are cached locally in your browser for workspace restore. App installations, immunization plans and outbreak snapshots also stay in this browser and workspace; they do not automatically sync to other devices. Export the files you need to keep or share. There is no app database storing your workspace on the server. When using AI features, the relevant context is temporarily sent to OpenAI for analysis, and drawings are stored in browser local storage.'
              },
              {
                question: 'How do flood and drought context layers work?',
                answer: 'Flood Context and Drought Context are Google Earth Engine overlays that you can turn on and off independently of the basemap. They act as both visual context and evidence gates for admin-level hazard scoring, so the platform can tell you when there is enough evidence to score a hazard and when there is not.'
              }
            ].map((faq, idx) => (
              <div key={idx} style={{
                background: '#F8FAFC',
                border: '1px solid #94A3B8',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <button
                  onClick={() => toggleFaq(idx)}
                  aria-expanded={openFaq === idx}
                  aria-controls={`landing-faq-${idx}`}
                  style={{
                    width: '100%',
                    padding: '20px 24px',
                    background: openFaq === idx ? '#1A365D' : 'transparent',
                    color: openFaq === idx ? 'white' : '#0F172A',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 600,
                    fontSize: '18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {faq.question}
                  <span style={{ fontSize: '24px' }}>
                    {openFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {openFaq === idx && (
                  <div id={`landing-faq-${idx}`} style={{
                    padding: '20px 24px',
                    color: '#475569',
                    fontSize: '16px',
                    lineHeight: '1.7',
                    background: 'white'
                  }}>
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{
        padding: '80px 20px',
        background: 'linear-gradient(180deg, white 0%, #F8FAFC 100%)',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: '42px',
            color: '#1A365D',
            marginBottom: '16px'
          }}>
            Ready to Build Your Response Workspace?
          </h2>
          <p style={{
            fontSize: '18px',
            color: '#475569',
            marginBottom: '40px'
          }}>
            Monitor the situation, open a workspace app, and turn your data into a plan your team can review.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/app">
              <button style={{
                background: '#FF6B35',
                color: 'white',
                border: 'none',
                padding: '16px 40px',
                borderRadius: '8px',
                fontSize: '16px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(255, 107, 53, 0.3)'
              }}
              onMouseEnter={(e) => e.target.style.opacity = '0.9'}
              onMouseLeave={(e) => e.target.style.opacity = '1'}
              >
                Launch App →
              </button>
            </Link>
            <a href="https://github.com/jmesplana" target="_blank" rel="noopener noreferrer">
              <button style={{
                background: 'transparent',
                color: '#1A365D',
                border: '2px solid #1A365D',
                padding: '16px 40px',
                borderRadius: '8px',
                fontSize: '16px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#1A365D';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.color = '#1A365D';
              }}
              >
                View on GitHub
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        background: '#1A365D',
        padding: '60px 20px 40px',
        color: 'white'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
            gap: '40px',
            marginBottom: '40px'
          }}>
            {/* Branding */}
            <div>
              <div style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: '24px',
                marginBottom: '12px'
              }}>
                Aidstack <span style={{ color: '#FF6B35' }}>Disasters</span>
              </div>
              <p style={{
                color: '#94A3B8',
                fontSize: '14px',
                lineHeight: '1.6',
                margin: 0
              }}>
                Part of Aidstack.ai - Operational intelligence for field teams
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: '16px',
                marginBottom: '16px'
              }}>
                Product
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <a href="#features" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >Features</a>
                <a href="#use-cases" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >Use Cases</a>
                <a href="#how-it-works" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >How It Works</a>
              </div>
            </div>

            {/* Resources */}
            <div>
              <h4 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: '16px',
                marginBottom: '16px'
              }}>
                Resources
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <a href="https://aidstack.ai" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >About Aidstack</a>
                <a href="https://github.com/jmesplana" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >GitHub</a>
                <a href="#" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >Documentation</a>
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: '16px',
                marginBottom: '16px'
              }}>
                Legal
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <a href="#" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >Privacy</a>
                <a href="#" style={{ color: '#94A3B8', fontSize: '14px', transition: 'color 0.3s' }}
                   onMouseEnter={(e) => e.target.style.color = 'white'}
                   onMouseLeave={(e) => e.target.style.color = '#94A3B8'}
                >Terms</a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{
            borderTop: '1px solid rgba(148, 163, 184, 0.2)',
            paddingTop: '32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <p style={{
              color: '#94A3B8',
              fontSize: '14px',
              margin: 0
            }}>
              © 2025 Aidstack.ai. All rights reserved.
            </p>
            <p style={{
              color: '#94A3B8',
              fontSize: '14px',
              margin: 0
            }}>
              Developed by <a href="https://github.com/jmesplana" target="_blank" rel="noopener noreferrer" style={{ color: '#FF6B35', textDecoration: 'none' }}>John Mark Esplana</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
