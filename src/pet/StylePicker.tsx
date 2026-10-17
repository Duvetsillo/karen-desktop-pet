import { useId } from 'react';
import { Check } from 'lucide-react';
import { PET_STYLES, type PetStyle } from '../../shared/types';
import { petStyles } from '../../shared/pet-styles';

function Portrait({ style }: { style: PetStyle }) {
  const id = useId();
  const cloud = style === 'cloud', orbit = style === 'orbit';
  return <svg viewBox="0 0 150 120" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x2=".8" y2="1"><stop stopColor={cloud ? '#fff0fc' : '#e0f8ff'}/><stop offset="1" stopColor={cloud ? '#b5a4cf' : orbit ? '#566e93' : '#7dc4e7'}/></linearGradient></defs>
    <ellipse cx="75" cy="109" rx="35" ry="4" fill="#8be4f3" opacity=".12"/>
    {orbit ? <g fill="#c7ecf9" stroke="#93e4f4" strokeWidth="3"><path d="M52 40L48 19M98 40l4-21"/><circle cx="48" cy="17" r="6"/><circle cx="102" cy="17" r="6"/></g> : <g fill={`url(#${id})`} stroke="#e3e5ff" strokeWidth="1"><path d={cloud ? 'M53 45C22 40 28 7 42 17c12 8 16 16 11 28' : 'M53 44C30 32 51 24 33 7c28 6 34 26 20 37'}/><path d={cloud ? 'M97 45c31-5 25-38 11-28-12 8-16 16-11 28' : 'M97 44c23-12 2-20 20-37-28 6-34 26-20 37'}/></g>}
    <g fill={`url(#${id})`} stroke="#e3f6ff" strokeWidth="1.2">
      <path d="M37 68c-28-8-25 20-7 18l13-8m70-10c28-8 25 20 7 18l-13-8"/>
      <path d={cloud ? 'M75 36c15-13 35-2 34 12 22 3 23 26 11 34 7 22-13 30-28 23-9 12-27 11-35 0-24 8-35-8-29-24-16-13-6-32 10-33 3-16 22-22 37-12Z' : orbit ? 'M75 34c34 0 47 18 44 42-1 21-13 29-44 29s-43-8-44-29c-3-24 10-42 44-42Z' : 'M75 33c38-3 54 23 43 49-8 15-6 27-21 23-14-9-14 12-28 1-13-11-20 10-29-6-2-12-15-16-11-35 4-23 22-32 46-32Z'}/>
    </g>
    <rect x="40" y="55" width="70" height="35" rx="16" fill="#1b304b" stroke="#c4efff" strokeOpacity=".7"/>
    <g fill="#bcf6ff"><ellipse cx="59" cy="71" rx="8" ry="11"/><ellipse cx="91" cy="71" rx="8" ry="11"/></g>
    <g fill="#2b4d79"><ellipse cx="60" cy="72" rx="4" ry="6"/><ellipse cx="90" cy="72" rx="4" ry="6"/></g>
    <g fill="white"><ellipse cx="57" cy="67" rx="2" ry="3"/><ellipse cx="87" cy="67" rx="2" ry="3"/></g>
    <path d="M70 82q5 4 10 0" fill="none" stroke="#dcfaff" strokeWidth="2" strokeLinecap="round"/>
    {orbit && <path d="M66 98h18" stroke="#b5efff" strokeWidth="3" strokeDasharray="4 3"/>}
  </svg>;
}
export function StylePicker({ value, onChange }: { value: PetStyle; onChange: (style: PetStyle) => void }) {
  return <fieldset className="pet-styles"><legend className="sr-only">Estilo de Karen</legend>
    {PET_STYLES.map(style => <label className={`pet-style-card ${value === style ? 'selected' : ''}`} key={style}>
      <input type="radio" name="pet-style" value={style} checked={value === style} onChange={() => onChange(style)}/>
      <Portrait style={style}/><span className="pet-style-name">{petStyles[style].name}{value === style && <Check size={14} aria-hidden="true"/>}</span><small>{petStyles[style].description}</small>
    </label>)}
  </fieldset>;
}
