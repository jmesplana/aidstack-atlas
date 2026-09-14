import { useState, useRef, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * GeocodingSearch Component
 * Collapsible search button in upper left corner
 * Allows users to search for locations by address, place name, or coordinates
 * Uses Nominatim (OpenStreetMap) geocoding service
 */
const GeocodingSearch = () => {
  const map = useMap();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [searchMarker, setSearchMarker] = useState(null);
  const searchTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Parse coordinate input (supports multiple formats)
  const parseCoordinates = (query) => {
    // Remove common prefixes and clean the string
    const cleaned = query.trim().replace(/^(coordinates?|coords?|location|loc)[:=\s]*/i, '');

    // Try various coordinate formats:
    // 1. "lat, lng" or "lat,lng"
    // 2. "lat lng"
    // 3. "-12.345, 67.890"
    // 4. "12.345° N, 67.890° E" (with degree symbols)

    const patterns = [
      // lat, lng with optional degree symbols and N/S/E/W
      /^(-?\d+\.?\d*)[°\s]*([NS])?,?\s*(-?\d+\.?\d*)[°\s]*([EW])?$/i,
      // Simple lat, lng
      /^(-?\d+\.?\d*),?\s+(-?\d+\.?\d*)$/,
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        let lat, lng;

        if (match.length === 5) {
          // Format with N/S/E/W
          lat = parseFloat(match[1]);
          lng = parseFloat(match[3]);

          if (match[2] && match[2].toUpperCase() === 'S') lat = -Math.abs(lat);
          if (match[4] && match[4].toUpperCase() === 'W') lng = -Math.abs(lng);
        } else {
          // Simple format
          lat = parseFloat(match[1]);
          lng = parseFloat(match[2]);
        }

        // Validate coordinate ranges
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          return { lat, lng };
        }
      }
    }

    return null;
  };

  // Geocode using Nominatim
  const geocodeAddress = async (query) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            'User-Agent': 'Aidstack Atlas Platform'
          }
        }
      );

      if (!response.ok) throw new Error('Geocoding failed');

      const results = await response.json();
      return results.map(result => ({
        displayName: result.display_name,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        boundingBox: result.boundingbox,
        type: result.type,
        importance: result.importance
      }));
    } catch (error) {
      console.error('Geocoding error:', error);
      return [];
    }
  };

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);

    // First, try to parse as coordinates
    const coords = parseCoordinates(searchQuery);
    if (coords) {
      setSearchResults([{
        displayName: `Coordinates: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
        lat: coords.lat,
        lng: coords.lng,
        type: 'coordinates',
        importance: 1
      }]);
      setShowResults(true);
      setIsSearching(false);
      return;
    }

    // Otherwise, geocode the address
    const results = await geocodeAddress(searchQuery);
    setSearchResults(results);
    setShowResults(results.length > 0);
    setIsSearching(false);
  };

  // Debounced search on input change
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearch();
      }, 500); // Debounce for 500ms
    } else {
      setSearchResults([]);
      setShowResults(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Navigate to selected location
  const goToLocation = (result) => {
    const { lat, lng, boundingBox } = result;

    // Remove previous search marker if exists
    if (searchMarker) {
      map.removeLayer(searchMarker);
    }

    // Create a custom marker
    const marker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'search-result-marker',
        html: `
          <div style="
            position: relative;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="
              position: absolute;
              width: 32px;
              height: 32px;
              background: #FF6B35;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            "></div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style="position: relative; z-index: 1;">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      })
    });

    marker.bindPopup(`
      <div style="font-family: 'Inter', sans-serif; max-width: 250px;">
        <div style="font-weight: 600; margin-bottom: 6px; color: #1A365D;">
          ${result.displayName}
        </div>
        <div style="font-size: 12px; color: #64748b;">
          ${lat.toFixed(6)}, ${lng.toFixed(6)}
        </div>
      </div>
    `);

    marker.addTo(map);
    setSearchMarker(marker);

    // Zoom to location
    if (boundingBox && boundingBox.length === 4) {
      // If we have a bounding box, fit to it
      const bounds = L.latLngBounds(
        [parseFloat(boundingBox[0]), parseFloat(boundingBox[2])],
        [parseFloat(boundingBox[1]), parseFloat(boundingBox[3])]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
      // Otherwise, just center and zoom
      map.setView([lat, lng], 13);
    }

    // Open popup
    marker.openPopup();

    // Clear search and collapse
    setSearchQuery('');
    setShowResults(false);
    setIsExpanded(false);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      goToLocation(searchResults[0]);
    } else if (e.key === 'Escape') {
      setShowResults(false);
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }
  };

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowResults(false);
        if (isExpanded && !searchQuery) {
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, searchQuery]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: 1000,
        fontFamily: "'Inter', sans-serif"
      }}
    >
      {!isExpanded ? (
        /* Collapsed Search Button */
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            width: '40px',
            height: '40px',
            backgroundColor: 'white',
            border: 'none',
            borderRadius: '4px',
            boxShadow: '0 1px 5px rgba(0,0,0,0.65)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
          title="Search location"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
      ) : (
        /* Expanded Search Box */
        <div style={{
          backgroundColor: 'white',
          borderRadius: '4px',
          boxShadow: '0 1px 5px rgba(0,0,0,0.65)',
          width: '300px'
        }}>
          <div style={{ position: 'relative' }}>
            {/* Search Input */}
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder="Search location..."
              style={{
                width: '100%',
                padding: '10px 80px 10px 12px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: 'white',
                outline: 'none',
                fontFamily: "'Inter', sans-serif",
                boxSizing: 'border-box'
              }}
            />

            {/* Search/Close Buttons */}
            <div style={{
              position: 'absolute',
              right: '4px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              gap: '4px'
            }}>
              {/* Search Button */}
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isSearching}
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: searchQuery.trim() ? '#FF6B35' : '#e2e8f0',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: searchQuery.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s',
                  opacity: isSearching ? 0.6 : 1
                }}
                title="Search"
              >
                {isSearching ? (
                  <div style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite'
                  }} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                )}
              </button>

              {/* Close Button */}
              <button
                onClick={() => {
                  setIsExpanded(false);
                  setSearchQuery('');
                  setShowResults(false);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                title="Close search"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              backgroundColor: 'white',
              borderRadius: '4px',
              boxShadow: '0 1px 5px rgba(0,0,0,0.65)',
              maxHeight: '300px',
              overflowY: 'auto',
              zIndex: 1001
            }}>
            {searchResults.map((result, index) => (
              <div
                key={index}
                onClick={() => goToLocation(result)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: index < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF6B35" style={{ flexShrink: 0, marginTop: '2px' }}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#0f172a',
                      marginBottom: '4px'
                    }}>
                      {result.displayName}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#64748b'
                    }}>
                      {result.lat.toFixed(6)}, {result.lng.toFixed(6)}
                      {result.type !== 'coordinates' && ` • ${result.type}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            </div>
          )}

          {/* Helper Text */}
          {searchQuery && !isSearching && searchResults.length === 0 && showResults && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              backgroundColor: 'white',
              borderRadius: '4px',
              boxShadow: '0 1px 5px rgba(0,0,0,0.65)',
              padding: '12px',
              fontSize: '12px',
              color: '#64748b',
              textAlign: 'center'
            }}>
              No results found. Try an address or coordinates.
            </div>
          )}
        </div>
      )}

      {/* Add spinner animation */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default GeocodingSearch;
