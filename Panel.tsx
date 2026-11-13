/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { ComicFace, INITIAL_PAGES, GATE_PAGE } from './types';
import { LoadingFX } from './LoadingFX';

interface PanelProps {
    face?: ComicFace;
    allFaces: ComicFace[]; // Needed for cover "printing" status
    heroImageUrl?: string;
    friendImageUrl?: string;
    onChoice: (pageIndex: number, choice: string) => void;
    onOpenBook: () => void;
    onDownload: () => void;
    onReset: () => void;
    onGoToDecision: () => void;
    onRetryPage: (pageIndex: number) => void;
}

export const Panel: React.FC<PanelProps> = ({
    face,
    allFaces,
    heroImageUrl,
    friendImageUrl,
    onChoice,
    onOpenBook,
    onDownload,
    onReset,
    onGoToDecision,
    onRetryPage,
}) => {
    if (!face) {
        const pendingDecision = allFaces.some(f => f.isDecisionPage && !f.resolvedChoice);
        if (pendingDecision) {
            return (
                <div className="panel-container flex-col gap-4 bg-yellow-50 text-center p-6 border-4 border-black">
                    <div className="font-comic text-4xl text-red-600 tracking-wide" style={{ textShadow: '2px 2px 0px black' }}>
                        TO BE UNLOCKED!
                    </div>
                    <p className="font-comic text-xl text-black max-w-xs leading-snug">
                        Make your choice on Page 3 to print the next chapter of your comic.
                    </p>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onGoToDecision(); }}
                        className="comic-btn bg-yellow-400 text-black px-6 py-3 text-2xl font-bold hover:bg-yellow-300"
                    >
                        GO TO PAGE 3
                    </button>
                </div>
            );
        }
        return <div className="w-full h-full bg-gray-950" />;
    }
    if (face.isLoading && !face.imageUrl) return <LoadingFX />;
    
    const isFullBleed = face.type === 'cover' || face.type === 'back_cover';

    if (!face.isLoading && !face.imageUrl) {
        const portraitUrl = face.narrative?.focus_char === 'friend' && friendImageUrl ? friendImageUrl : heroImageUrl;
        const hasStoryContent = Boolean(face.narrative?.caption || face.narrative?.dialogue || face.narrative?.scene);

        if (face.type === 'story' && hasStoryContent && face.narrative) {
            return (
                <div className="panel-container relative flex-col justify-between bg-amber-50 p-3 sm:p-4 overflow-hidden">
                    <div className="gloss"></div>

                    {/* Top Bar: Page badge + subtle Retry AI Art action */}
                    <div className="w-full flex items-center justify-between gap-2 z-10">
                        <span className="bg-black text-yellow-400 font-comic text-xs sm:text-sm px-2 py-0.5 tracking-wider border border-black">
                            PAGE {face.pageIndex}
                        </span>
                        {typeof face.pageIndex === 'number' && (
                            <button
                                type="button"
                                title={face.errorMessage || 'Retry AI illustration'}
                                onClick={(e) => { e.stopPropagation(); onRetryPage(face.pageIndex!); }}
                                className="bg-white hover:bg-yellow-300 text-black font-comic text-xs px-2.5 py-0.5 border-2 border-black shadow-[2px_2px_0px_black] cursor-pointer uppercase"
                            >
                                RETRY AI ART
                            </button>
                        )}
                    </div>

                    {/* Narrator Caption Box */}
                    {face.narrative.caption && (
                        <div className="w-full bg-yellow-300 border-[3px] border-black shadow-[3px_3px_0px_black] p-2.5 z-10 my-1.5">
                            <p className="font-bold text-xs sm:text-sm text-black leading-snug uppercase tracking-tight">
                                {face.narrative.caption}
                            </p>
                        </div>
                    )}

                    {/* Stylized Scene Panel */}
                    <div className="w-full flex-1 min-h-0 bg-gradient-to-br from-slate-900 via-slate-800 to-zinc-900 border-[3px] border-black relative overflow-hidden flex flex-col items-center justify-center p-3 text-center my-1">
                        <div
                            className="absolute inset-0 opacity-20 pointer-events-none"
                            style={{
                                backgroundImage: 'radial-gradient(#fff 1.2px, transparent 1.2px)',
                                backgroundSize: '12px 12px',
                            }}
                        />
                        {portraitUrl && (
                            <img
                                src={portraitUrl}
                                alt="Character"
                                className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-full border-[3px] border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.35)] mb-2 relative z-10"
                            />
                        )}
                        <p className="text-[11px] sm:text-xs text-slate-200 italic leading-relaxed max-w-[92%] line-clamp-5 relative z-10">
                            {face.narrative.scene}
                        </p>
                    </div>

                    {/* Speech Bubble */}
                    {face.narrative.dialogue && (
                        <div className="w-full bg-white border-[3px] border-black rounded-2xl shadow-[3px_3px_0px_black] px-3 py-2 z-10 mt-1">
                            <p className="font-bold text-xs sm:text-sm text-black leading-snug text-center">
                                &ldquo;{face.narrative.dialogue}&rdquo;
                            </p>
                        </div>
                    )}

                    {/* Decision Buttons (if Page 3) */}
                    {face.isDecisionPage && face.choices.length > 0 && (
                        <div className={`absolute bottom-0 inset-x-0 p-5 pb-8 flex flex-col gap-2.5 items-center justify-end transition-opacity duration-500 ${face.resolvedChoice ? 'opacity-0 pointer-events-none' : 'opacity-100'} bg-gradient-to-t from-black/95 via-black/75 to-transparent z-20`}>
                            <p className="text-white font-comic text-2xl uppercase tracking-widest animate-pulse">What drives you?</p>
                            {face.choices.map((choice, i) => (
                                <button key={i} onClick={(e) => { e.stopPropagation(); if(face.pageIndex) onChoice(face.pageIndex, choice); }}
                                  className={`comic-btn w-full py-2.5 text-lg font-bold tracking-wider ${i===0?'bg-yellow-400 hover:bg-yellow-300':'bg-blue-500 text-white hover:bg-blue-400'}`}>
                                    {choice}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="panel-container flex-col gap-3 bg-slate-900 text-center p-6 overflow-hidden relative">
                <div className="gloss"></div>
                <div className="font-comic text-4xl text-yellow-400 tracking-wide z-10" style={{ textShadow: '2px 2px 0px black' }}>
                    {face.type === 'cover' ? 'INFINITE HEROES' : face.type === 'back_cover' ? 'TO BE CONTINUED...' : 'INK SMUDGED!'}
                </div>
                {heroImageUrl && face.type === 'cover' && (
                    <img src={heroImageUrl} alt="Hero" className="w-28 h-28 object-cover border-4 border-yellow-400 shadow-[4px_4px_0px_black] z-10" />
                )}
                {face.errorMessage && (
                    <p className="text-xs text-slate-200 bg-black/70 border border-slate-600 px-3 py-2 max-w-[260px] break-words line-clamp-3 z-10">
                        {face.errorMessage}
                    </p>
                )}
                {typeof face.pageIndex === 'number' && face.type !== 'cover' && face.type !== 'back_cover' && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRetryPage(face.pageIndex!); }}
                        className="comic-btn bg-yellow-400 text-black px-6 py-3 text-xl font-bold hover:bg-yellow-300 z-10"
                    >
                        RETRY PAGE
                    </button>
                )}

                {face.type === 'cover' && (
                    <div className="absolute bottom-20 inset-x-0 flex justify-center z-20">
                        <button onClick={(e) => { e.stopPropagation(); onOpenBook(); }}
                         disabled={!allFaces.find(f => f.pageIndex === GATE_PAGE) || allFaces.find(f => f.pageIndex === GATE_PAGE)?.isLoading}
                         className="comic-btn bg-yellow-400 px-10 py-4 text-3xl font-bold hover:scale-105 disabled:bg-gray-400 disabled:cursor-wait">
                            {(!allFaces.find(f => f.pageIndex === GATE_PAGE) || allFaces.find(f => f.pageIndex === GATE_PAGE)?.isLoading) ? 'PRINTING...' : 'READ ISSUE #1'}
                        </button>
                    </div>
                )}

                {face.type === 'back_cover' && (
                    <div className="absolute bottom-20 inset-x-0 flex flex-col items-center gap-4 z-20">
                        <button onClick={(e) => { e.stopPropagation(); onDownload(); }} className="comic-btn bg-blue-500 text-white px-8 py-3 text-xl font-bold hover:scale-105">DOWNLOAD ISSUE</button>
                        <button onClick={(e) => { e.stopPropagation(); onReset(); }} className="comic-btn bg-green-500 text-white px-8 py-4 text-2xl font-bold hover:scale-105">CREATE NEW ISSUE</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`panel-container relative group ${isFullBleed ? '!p-0 !bg-[#0a0a0a]' : ''}`}>
            <div className="gloss"></div>
            {face.imageUrl && <img src={face.imageUrl} alt="Comic panel" className={`panel-image ${isFullBleed ? '!object-cover' : ''}`} />}
            
            {/* Decision Buttons */}
            {face.isDecisionPage && face.choices.length > 0 && (
                <div className={`absolute bottom-0 inset-x-0 p-6 pb-12 flex flex-col gap-3 items-center justify-end transition-opacity duration-500 ${face.resolvedChoice ? 'opacity-0 pointer-events-none' : 'opacity-100'} bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20`}>
                    <p className="text-white font-comic text-2xl uppercase tracking-widest animate-pulse">What drives you?</p>
                    {face.choices.map((choice, i) => (
                        <button key={i} onClick={(e) => { e.stopPropagation(); if(face.pageIndex) onChoice(face.pageIndex, choice); }}
                          className={`comic-btn w-full py-3 text-xl font-bold tracking-wider ${i===0?'bg-yellow-400 hover:bg-yellow-300':'bg-blue-500 text-white hover:bg-blue-400'}`}>
                            {choice}
                        </button>
                    ))}
                </div>
            )}

            {/* Cover Action */}
            {face.type === 'cover' && (
                 <div className="absolute bottom-20 inset-x-0 flex justify-center z-20">
                     <button onClick={(e) => { e.stopPropagation(); onOpenBook(); }}
                      disabled={!allFaces.find(f => f.pageIndex === GATE_PAGE) || allFaces.find(f => f.pageIndex === GATE_PAGE)?.isLoading}
                      className="comic-btn bg-yellow-400 px-10 py-4 text-3xl font-bold hover:scale-105 animate-bounce disabled:animate-none disabled:bg-gray-400 disabled:cursor-wait">
                         {(!allFaces.find(f => f.pageIndex === GATE_PAGE) || allFaces.find(f => f.pageIndex === GATE_PAGE)?.isLoading) ? `PRINTING... ${allFaces.filter(f => f.type==='story' && !f.isLoading && (f.pageIndex||0) <= GATE_PAGE).length}/${INITIAL_PAGES}` : 'READ ISSUE #1'}
                     </button>
                 </div>
            )}

            {/* Back Cover Actions */}
            {face.type === 'back_cover' && (
                <div className="absolute bottom-24 inset-x-0 flex flex-col items-center gap-4 z-20">
                    <button onClick={(e) => { e.stopPropagation(); onDownload(); }} className="comic-btn bg-blue-500 text-white px-8 py-3 text-xl font-bold hover:scale-105">DOWNLOAD ISSUE</button>
                    <button onClick={(e) => { e.stopPropagation(); onReset(); }} className="comic-btn bg-green-500 text-white px-8 py-4 text-2xl font-bold hover:scale-105">CREATE NEW ISSUE</button>
                </div>
            )}
        </div>
    );
}
