import { shareRegion } from './shareRegion'

describe('shareRegion', () => {
  it('drops the locality and keeps only the state', () => {
    expect(shareRegion({ city: 'Rani Bagh', state: 'Delhi', country: 'India' })).toBe('Delhi')
    expect(shareRegion({ city: 'Shri Nagar, Rani Bagh, Delhi' })).toBe('Delhi')
    expect(shareRegion({ city: 'New Delhi-110015', state: 'New delhi' })).toBe('Delhi')
  })
  it('maps a town typed into the state field to its real state', () => {
    expect(shareRegion({ city: 'Agra', state: 'Agra' })).toBe('Uttar Pradesh')
    expect(shareRegion({ city: 'Achnera', state: 'Achnera' })).toBe('Uttar Pradesh')
    expect(shareRegion({ city: 'Sonipat', state: 'Sonipat' })).toBe('Haryana')
    expect(shareRegion({ city: 'Shakur pur', state: 'Shakur pur' })).toBe('Delhi')
  })
  it('falls back to the city when the state is junk', () => {
    expect(shareRegion({ city: 'Gurugram', state: 'Hsh' })).toBe('Haryana')
    expect(shareRegion({ city: 'Katputli Behror', state: '' })).toBe('Rajasthan')
  })
  it('shows nothing for an unknown small place', () => {
    expect(shareRegion({ city: 'Mun', state: 'D' })).toBe(null)
    expect(shareRegion({})).toBe(null)
  })
  it('shows the country for profiles abroad', () => {
    expect(shareRegion({ city: 'Toronto', state: 'Ontario (Work Permit)', country: 'Canada' })).toBe('Canada')
    expect(shareRegion({ city: 'Delhi', state: 'Delhi', country: 'WIndia' })).toBe('Delhi')
  })
})
