import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { apartmentsAPI, bookingsAPI, chatAPI, getApiErrorMessage, reviewsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useStoreVersion } from '../hooks/useStoreVersion';
import { AVATAR_SM_PLACEHOLDER } from '../utils/placeholders';

export const ApartmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const storeVersion = useStoreVersion();
  const mapSectionRef = useRef(null);
  
  const [apartment, setApartment] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  const [bookingForm, setBookingForm] = useState({
    startDate: '',
    endDate: '',
    requestedOccupants: 1,
    message: '',
  });

  const [reviews, setReviews] = useState([]);
  const [hasActiveBooking, setHasActiveBooking] = useState(false);
  const [hasApprovedBooking, setHasApprovedBooking] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5 });
  const [submittingReview, setSubmittingReview] = useState(false);

  const isVerified = Boolean(apartment?.verified);
  const locationLabel =
    apartment?.city && apartment?.district
      ? `${apartment.district}, ${apartment.city}`
      : apartment?.locationAddress || apartment?.address || apartment?.location || '';
  const mediaUrl = apartment?.videoUrl || apartment?.video_url || '';

  // Role Checks
  const userRole = (user?.role || '').toLowerCase();
  const isUserOwner = userRole === 'owner';
  const isUserStudent = userRole === 'student' || userRole === 'client';
  const hasPhoneNumber = user?.phoneNumber || user?.phone;

  const bookingSummary = useMemo(() => {
    if (!bookingForm.startDate || !bookingForm.endDate || !apartment) return null;
    const start = new Date(bookingForm.startDate);
    const end = new Date(bookingForm.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return null;
    
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const numMonths = diffDays / 30;
    const occupants = Number(bookingForm.requestedOccupants) || 1;
    const pricePerMonth = Number(apartment.price) || 0;
    const totalPrice = numMonths * pricePerMonth * occupants; 

    return { 
      days: diffDays, 
      months: numMonths.toFixed(1),
      unitPrice: pricePerMonth,
      totalPrice: totalPrice.toFixed(2),
      totalNumeric: totalPrice,
      apartmentName: apartment.title || apartment.name,
      start: bookingForm.startDate,
      end: bookingForm.endDate,
      people: occupants
    };
  }, [bookingForm.startDate, bookingForm.endDate, bookingForm.requestedOccupants, apartment]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await apartmentsAPI.getApartment(id);
        setApartment(response.data);
        
        try {
          const resReviews = await reviewsAPI.getApartmentReviews(id);
          setReviews(resReviews.data?.reviews || []);
        } catch (e) {
          console.warn('Reviews are not available yet.', e);
        }

        if (user) {
          const checkRes = await bookingsAPI.checkActiveBooking(user._id, id);
          setHasActiveBooking(Boolean(checkRes.exists || checkRes.active));

          const bookingsRes = await bookingsAPI.getStudentBookings(user._id);
          const userBookings = bookingsRes.data?.bookings || [];
          const approvedBooking = userBookings.some((booking) => {
            const bookingApartmentId = booking.apartmentId || booking.apartment?._id || booking.apartment?.id;
            return (
              String(bookingApartmentId) === String(id) &&
              ['accepted', 'approved', 'confirmed', 'completed'].includes(booking.status)
            );
          });
          setHasApprovedBooking(approvedBooking);
        } else {
          setHasActiveBooking(false);
          setHasApprovedBooking(false);
        }
      } catch (error) {
        console.error('Error loading page data:', error);
      } finally {
        setLoading(false);
      }
    };
    if (id) loadData();
  }, [id, storeVersion, user]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await reviewsAPI.createReview({
        apartmentId: id,
        rating: newReview.rating,
        comment: '',
      });
      setNewReview({ rating: 5 });
      const resReviews = await reviewsAPI.getApartmentReviews(id);
      setReviews(resReviews.data?.reviews || []);
      const response = await apartmentsAPI.getApartment(id);
      setApartment(response.data);
    } catch (err) {
      alert(getApiErrorMessage(err, 'Failed to submit review'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const openGallery = (index) => {
    setSelectedImageIndex(index);
    setIsGalleryModalOpen(true);
  };

  const goToNextImage = (e) => {
    e.stopPropagation();
    if (!images.length) return;
    setSelectedImageIndex((current) => (current + 1) % images.length);
  };

  const goToPreviousImage = (e) => {
    e.stopPropagation();
    if (!images.length) return;
    setSelectedImageIndex((current) => (current - 1 + images.length) % images.length);
  };

  const handleMessageOwner = async () => {
    if (!isAuthenticated) return navigate('/login');
    if (isUserOwner) {
      alert('Owners are not allowed to message other owners');
      return;
    }

    try {
      const response = await chatAPI.getOrCreateConversation({
        participantIds: [user._id, apartment.owner._id],
        apartmentId: apartment._id,
        participants: [
          { _id: user._id, fullName: user.fullName || user.name || '', photoUrl: user.photoUrl || user.avatar || '', role: user.role },
          { _id: apartment.owner._id, fullName: apartment.owner.fullName || apartment.owner.name || '', photoUrl: apartment.owner.photoUrl || apartment.owner.avatar || '', role: 'owner' },
        ],
      });
      const conversation = response.data?.conversation || response.data;
      if (conversation?._id) navigate(`/messages/${conversation._id}`);
    } catch (error) {
      alert(getApiErrorMessage(error, 'Could not start chat with owner.'));
    }
  };

  const handleOpenBookingModal = async () => {
    if (!isAuthenticated) {
      alert('Please login before booking');
      navigate('/login');
      return;
    }

    setBookingLoading(true);
    try {
      const checkRes = await bookingsAPI.checkActiveBooking(user?._id, id);
      if (checkRes.exists || checkRes.active) {
        setHasActiveBooking(true);
        alert('You already have an active booking for this apartment');
        return;
      }
      setIsBookingModalOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleBooking = async (e) => {
    if (e) e.preventDefault();
    setBookingError('');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(bookingForm.startDate);
    const end = new Date(bookingForm.endDate);
    const availablePeople = apartment?.available_people || apartment?.max_people || 0;

    if (!bookingForm.startDate) return setBookingError('Please select start date');
    if (!bookingForm.endDate) return setBookingError('Please select end date');
    if (start < today) return setBookingError('Start date cannot be before today');
    if (end <= start) return setBookingError('End date cannot be before start date');
    if (!bookingForm.requestedOccupants || bookingForm.requestedOccupants < 1) return setBookingError('Number of people is required');
    if (bookingForm.requestedOccupants > availablePeople) return setBookingError('People count exceeds apartment capacity');

    setBookingLoading(true);
    try {
      await bookingsAPI.createBooking({
        apartmentId: id,
        apartmentName: apartment.title || apartment.name,
        apartmentAddress: apartment.address || locationLabel,
        apartmentImage: images[0] || null,
        ownerId: apartment.ownerId || apartment.owner?._id,
        ownerName: apartment.ownerName || apartment.owner?.fullName,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalPrice: bookingSummary?.totalNumeric || 0,
        people_count: Number(bookingForm.requestedOccupants),
        message: bookingForm.message
      });

      setBookingSuccess('Booking request sent successfully');
      setIsBookingModalOpen(false);
      setTimeout(() => navigate('/my-bookings'), 2000);
    } catch (error) {
      alert(getApiErrorMessage(error, 'Failed to create booking'));
    } finally {
      setBookingLoading(false);
    }
  };

  const scrollToMap = () => {
    if (mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const images = apartment?.images || [];
  const capacity = Number(apartment?.max_people ?? apartment?.capacity ?? 0);
  const availableSpots = Math.max(
    Math.min(Number(apartment?.available_people ?? capacity) || 0, capacity || Number.MAX_SAFE_INTEGER),
    0,
  );
  const occupiedCount = capacity > 0
    ? Math.max(capacity - availableSpots, 0)
    : Number(apartment?.occupiedCount || 0);
  const occupancyPercent = capacity > 0 ? Math.min((occupiedCount / capacity) * 100, 100) : 0;
  const canShowChatButton = !user || userRole !== 'owner';

  const apartmentLat = apartment?.latitude || apartment?.lat;
  const apartmentLng = apartment?.longitude || apartment?.lng;
  const mapEmbedUrl = (apartmentLat && apartmentLng) 
    ? `https://maps.google.com/maps?q=${apartmentLat},${apartmentLng}&z=16&output=embed`
    : null;

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
    </div>
  );

  if (!apartment) return (
    <div className="min-h-screen bg-light flex items-center justify-center text-gray-600 font-bold uppercase tracking-widest">
      Apartment not found
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {bookingSuccess && (
          <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-emerald-700 font-bold flex items-center gap-3 shadow-sm animate-in fade-in">
            <i className="fas fa-check-circle"></i> {bookingSuccess}
          </div>
        )}

        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 md:text-4xl">{apartment.title || apartment.name}</h1>
            <p className="mt-2 text-slate-500 font-medium flex items-center gap-2">
              <i className="fas fa-location-dot text-primary"></i> {locationLabel}
            </p>
          </div>
          {mapEmbedUrl && (
            <button 
              onClick={scrollToMap}
              className="flex items-center gap-2 bg-white px-5 py-3 rounded-2xl font-bold text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 transition"
            >
              <i className="fas fa-map-marked-alt text-primary"></i>
              Show Apartment Location
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-[32px] bg-white shadow-xl border border-slate-100">
          <div className="bg-slate-900 aspect-video w-full overflow-hidden relative group">
            {mediaUrl ? (
              <video controls className="h-full w-full object-cover" src={mediaUrl} />
            ) : (
              <img 
                src={images[0]} 
                className="h-full w-full object-cover cursor-pointer transition duration-500 group-hover:scale-105" 
                alt="" 
                onClick={() => openGallery(0)}
              />
            )}
            {!mediaUrl && images.length > 1 && (
              <button 
                onClick={() => openGallery(0)}
                className="absolute bottom-6 right-6 bg-white/90 backdrop-blur px-4 py-2 rounded-xl text-xs font-black text-slate-900 shadow-lg flex items-center gap-2 hover:bg-white transition"
              >
                <i className="fas fa-images"></i> View all {images.length} photos
              </button>
            )}
          </div>

          <div className="p-8 space-y-8">
            {/* Image Thumbnails Grid */}
            {images.length > 1 && (
              <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                {images.map((img, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => openGallery(idx)}
                    className="aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 border-transparent hover:border-primary transition group relative"
                  >
                    <img src={img} className="h-full w-full object-cover transition duration-300 group-hover:scale-110" alt={`Room ${idx + 1}`} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition"></div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col md:flex-row justify-between gap-6 border-b border-slate-50 pb-8">
               <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <Badge icon="fa-bed" text={`${apartment.bedrooms || apartment.beds || 0} Beds`} />
                    <Badge icon="fa-bath" text={`${apartment.bathrooms || 0} Bath`} />
                    <Badge icon="fa-door-open" text={`${apartment.rooms || 0} Rooms`} />
                  </div>
               </div>
               <div className="bg-primary/5 p-5 rounded-2xl text-center min-w-[160px]">
                  <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">Monthly Rent</span>
                  <span className="text-3xl font-black text-primary">{apartment.price} EGY</span>
               </div>
            </div>

            <div className={`inline-flex items-center gap-2 rounded-2xl p-4 border w-full ${isVerified ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
              <i className={`fas ${isVerified ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
              <p className="text-sm font-bold">This apartment is {isVerified ? '' : 'not'} verified by Sokon administrator</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-10">
              <div>
                <h2 className="text-xl font-black text-slate-900 mb-4">Description</h2>
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{apartment.description_en || apartment.description}</p>
              </div>
              <div className="space-y-6">
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 shadow-sm">
                   <h3 className="font-black text-slate-900 mb-4 text-lg">Unit Status</h3>
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-sm text-slate-500 font-bold">Occupancy</span>
                     <span className="text-sm font-black text-slate-900">{occupiedCount} / {capacity}</span>
                   </div>
                   <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${occupancyPercent}%` }}></div>
                   </div>
                   <p className="mt-4 text-xs text-slate-400 font-medium italic">Available Spots: {availableSpots}</p>
                </div>
              </div>
            </div>

            {/* Map Section */}
            {mapEmbedUrl && (
              <div ref={mapSectionRef} className="space-y-4">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <i className="fas fa-map-location-dot text-primary"></i>
                  Property Location
                </h2>
                <div className="h-96 w-full rounded-[32px] overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
                  <iframe
                    title="Apartment Location"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0 }}
                    src={mapEmbedUrl}
                    allowFullScreen
                  ></iframe>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <i className="fas fa-circle-info text-primary"></i>
                  Exact location coordinates: {apartmentLat}, {apartmentLng}
                </div>
              </div>
            )}

            {apartment.owner && (
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 flex items-center justify-between gap-4">
                 <div className="flex items-center gap-4">
                    <img src={apartment.owner.avatar || AVATAR_SM_PLACEHOLDER} className="h-14 w-14 rounded-2xl object-cover shadow-sm" alt="" />
                    <div>
                       <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Property Owner</p>
                       <h4 className="text-lg font-black text-slate-900">{apartment.owner.fullName}</h4>
                    </div>
                 </div>
                 {user?._id !== apartment.owner?._id && canShowChatButton && (
                   <button onClick={handleMessageOwner} className="bg-white px-6 py-3 rounded-2xl font-bold text-slate-700 shadow-sm hover:bg-slate-100 transition border border-slate-100 flex items-center gap-2">
                     <i className="far fa-comment-dots text-primary"></i>
                     Contact Owner
                   </button>
                 )}
              </div>
            )}

            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Rating</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-3xl font-black text-slate-900">
                      {Number(apartment.rating_average || 0).toFixed(1)}
                    </span>
                    <div>
                      <div className="flex items-center text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <i
                            key={i}
                            className={`${i < Math.round(apartment.rating_average || 0) ? 'fa-solid' : 'fa-regular'} fa-star mr-1`}
                          ></i>
                        ))}
                      </div>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {apartment.rating_count || 0} rating{Number(apartment.rating_count || 0) === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </div>

                {hasApprovedBooking && isUserStudent && (
                  <form onSubmit={handleReviewSubmit} className="flex flex-col gap-3 md:items-end">
                    <div className="flex items-center gap-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setNewReview((current) => ({ ...current, rating: i + 1 }))}
                          className="text-2xl text-amber-400 transition hover:scale-110"
                          aria-label={`Rate ${i + 1} star${i === 0 ? '' : 's'}`}
                        >
                          <i className={`${i < newReview.rating ? 'fa-solid' : 'fa-regular'} fa-star`}></i>
                        </button>
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="rounded-2xl bg-primary px-5 py-3 text-sm font-black text-white transition hover:opacity-95 disabled:opacity-60"
                    >
                      {submittingReview ? 'Saving rating...' : 'Save rating'}
                    </button>
                  </form>
                )}
              </div>

              {reviews.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {reviews.map((review) => (
                    <div key={review._id || review.id} className="rounded-2xl bg-white p-4 border border-slate-100">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={review.userAvatar || AVATAR_SM_PLACEHOLDER}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                          <p className="truncate text-sm font-black text-slate-900">{review.userName}</p>
                        </div>
                        <div className="flex shrink-0 items-center text-xs text-amber-400">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <i key={i} className={`${i < review.rating ? 'fa-solid' : 'fa-regular'} fa-star ml-1`}></i>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              {isUserStudent && !hasPhoneNumber ? (
                <div className="bg-amber-50 border border-amber-200 rounded-[24px] p-8 text-center shadow-sm w-full">
                  <p className="text-amber-800 font-bold mb-6 text-lg">Please add your phone number before renting an apartment</p>
                  <Link
                    to="/profile"
                    className="inline-block w-full py-5 rounded-[24px] bg-amber-600 text-white font-black shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition transform active:scale-[0.98]"
                  >
                    Complete Profile First
                  </Link>
                </div>
              ) : (isUserStudent || !user) && (
                <button
                  onClick={handleOpenBookingModal}
                  disabled={availableSpots === 0 || hasActiveBooking || bookingLoading}
                  className="flex-1 rounded-2xl bg-primary py-4 text-center text-lg font-black text-white transition hover:opacity-95 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {hasActiveBooking ? 'Already Requested' : availableSpots === 0 ? 'Apartment Full' : 'Rent Now'}
                </button>
              )}
              
              {user?.role === 'owner' && user?._id === apartment.owner?._id && (
                <button onClick={() => navigate(`/edit-apartment/${id}`)} className="w-full py-5 rounded-[24px] bg-slate-900 text-white text-xl font-black shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition">
                  Edit listing
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image Gallery Modal */}
      {isGalleryModalOpen && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4"
          onClick={() => setIsGalleryModalOpen(false)}
        >
          <button 
            onClick={() => setIsGalleryModalOpen(false)} 
            className="absolute top-8 right-8 h-12 w-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition text-xl z-[70]"
          >
            <i className="fas fa-times"></i>
          </button>
          
          {images.length > 1 && (
            <>
              <button 
                onClick={goToPreviousImage}
                className="absolute left-4 md:left-8 h-14 w-14 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition text-2xl z-[70]"
              >
                <i className="fas fa-chevron-left"></i>
              </button>
              <button 
                onClick={goToNextImage}
                className="absolute right-4 md:right-8 h-14 w-14 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition text-2xl z-[70]"
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </>
          )}

          <div className="relative mt-16 max-w-5xl w-full h-full flex flex-col items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <img 
              src={images[selectedImageIndex]} 
              className="h-[75vh] w-auto object-contain rounded-2xl shadow-2xl select-none" 
              alt={`Apartment view ${selectedImageIndex + 1}`} 
            />
            <div className="mt-6 flex flex-col items-center gap-2">
              <span className="px-4 py-2 bg-white/10 backdrop-blur rounded-full text-white text-sm font-bold">
                {selectedImageIndex + 1} / {images.length}
              </span>
              <div className="flex gap-2 mt-2 overflow-x-auto max-w-full px-4 pb-2">
                {images.map((img, idx) => (
                  <div 
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`h-16 w-16 rounded-xl overflow-hidden cursor-pointer border-2 transition-all flex-shrink-0 ${selectedImageIndex === idx ? 'border-primary scale-110 shadow-lg shadow-primary/20' : 'border-transparent opacity-50 hover:opacity-100'}`}
                  >
                    <img src={img} className="h-full w-full object-cover" alt="" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg p-8 relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsBookingModalOpen(false)} className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-900"><i className="fas fa-times"></i></button>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Book apartment</h3>
            <p className="text-slate-500 text-sm mb-6">Enter stay duration and occupants</p>
            
            {bookingError && <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm font-bold flex items-center gap-2"><i className="fas fa-circle-exclamation"></i> {bookingError}</div>}

            <form onSubmit={handleBooking} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date" type="date" value={bookingForm.startDate} onChange={v => setBookingForm({...bookingForm, startDate: v})} />
                <Input label="End Date" type="date" value={bookingForm.endDate} onChange={v => setBookingForm({...bookingForm, endDate: v})} />
              </div>
              <Input label="Number of People" type="number" min="1" max={availableSpots || (apartment?.max_people)} value={bookingForm.requestedOccupants} onChange={v => setBookingForm({...bookingForm, requestedOccupants: v})} />

              {bookingSummary && (
                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-3 shadow-inner">
                   <h4 className="font-black text-slate-900 uppercase tracking-widest text-[10px] border-b border-slate-200 pb-2">Booking Summary</h4>
                   <SummaryRow label="Stay Duration" value={`${bookingSummary.months} Months (${bookingSummary.days} Days)`} />
                   <SummaryRow label="Price per Month" value={`$${bookingSummary.unitPrice}`} />
                   <SummaryRow label="Occupants" value={`${bookingSummary.people} Person`} />
                   <div className="flex justify-between items-center pt-3 border-t border-slate-200"><span className="text-slate-900 font-black">Total Price</span><span className="text-2xl font-black text-primary">${bookingSummary.totalPrice}</span></div>
                </div>
              )}

              <button type="submit" disabled={bookingLoading} className="w-full py-4 rounded-2xl bg-primary text-white font-black hover:opacity-95 transition flex items-center justify-center gap-3 shadow-xl shadow-primary/20">
                {bookingLoading ? (
                  <>
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Creating booking...
                  </>
                ) : 'Confirm Booking'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Badge = ({ icon, text }) => (
  <span className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2">
    <i className={`fas ${icon} text-primary`}></i> {text}
  </span>
);

const Input = ({ label, type, value, onChange, ...rest }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} {...rest} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/5 transition font-bold" required />
  </div>
);

const SummaryRow = ({ label, value }) => (
  <div className="flex justify-between text-sm font-bold">
    <span className="text-slate-400">{label}</span>
    <span className="text-slate-900 truncate ml-4 text-right">{value}</span>
  </div>
);
