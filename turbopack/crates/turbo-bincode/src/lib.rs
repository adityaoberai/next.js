use bincode::{
    BorrowDecode, Decode, Encode,
    de::{BorrowDecoder, Decoder},
    enc::Encoder,
    error::{DecodeError, EncodeError},
};

pub mod indexmap {
    use std::hash::{BuildHasher, Hash};

    use ::indexmap::IndexMap;

    use super::*;

    pub fn encode<E, K, V, S>(map: &IndexMap<K, V, S>, encoder: &mut E) -> Result<(), EncodeError>
    where
        E: Encoder,
        K: Encode,
        V: Encode,
    {
        usize::encode(&map.len(), encoder)?;
        for (k, v) in map {
            K::encode(k, encoder)?;
            V::encode(v, encoder)?;
        }
        Ok(())
    }

    pub fn decode<Context, D, K, V, S>(decoder: &mut D) -> Result<IndexMap<K, V, S>, DecodeError>
    where
        D: Decoder<Context = Context>,
        K: Decode<Context> + Eq + Hash,
        V: Decode<Context>,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut map = IndexMap::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            map.insert(K::decode(decoder)?, V::decode(decoder)?);
        }
        Ok(map)
    }

    pub fn borrow_decode<'de, Context, D, K, V, S>(
        decoder: &mut D,
    ) -> Result<IndexMap<K, V, S>, DecodeError>
    where
        D: BorrowDecoder<'de, Context = Context>,
        K: BorrowDecode<'de, Context> + Eq + Hash,
        V: BorrowDecode<'de, Context>,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut map = IndexMap::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            map.insert(K::borrow_decode(decoder)?, V::borrow_decode(decoder)?);
        }
        Ok(map)
    }
}

pub mod indexset {
    use std::hash::{BuildHasher, Hash};

    use ::indexmap::IndexSet;

    use super::*;

    pub fn encode<E, T, S>(set: &IndexSet<T, S>, encoder: &mut E) -> Result<(), EncodeError>
    where
        E: Encoder,
        T: Encode,
    {
        usize::encode(&set.len(), encoder)?;
        for item in set {
            T::encode(item, encoder)?;
        }
        Ok(())
    }

    pub fn decode<Context, D, T, S>(decoder: &mut D) -> Result<IndexSet<T, S>, DecodeError>
    where
        D: Decoder<Context = Context>,
        T: Decode<Context> + Eq + Hash,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut set = IndexSet::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            set.insert(T::decode(decoder)?);
        }
        Ok(set)
    }

    pub fn borrow_decode<'de, Context, D, T, S>(
        decoder: &mut D,
    ) -> Result<IndexSet<T, S>, DecodeError>
    where
        D: BorrowDecoder<'de, Context = Context>,
        T: BorrowDecode<'de, Context> + Eq + Hash,
        S: BuildHasher + Default,
    {
        let len = usize::decode(decoder)?;
        let mut set = IndexSet::with_capacity_and_hasher(len, Default::default());
        for _i in 0..len {
            set.insert(T::borrow_decode(decoder)?);
        }
        Ok(set)
    }
}

pub mod mime_option {
    use std::str::FromStr;

    use mime::Mime;

    use super::*;

    pub fn encode<E: Encoder>(mime: &Option<Mime>, encoder: &mut E) -> Result<(), EncodeError> {
        let mime_str: Option<&str> = mime.as_ref().map(AsRef::as_ref);
        Encode::encode(&mime_str, encoder)
    }

    pub fn decode<Context, D: Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<Option<Mime>, DecodeError> {
        if let Some(mime_str) = <Option<String> as Decode<Context>>::decode(decoder)? {
            Ok(Some(
                Mime::from_str(&mime_str).map_err(|e| DecodeError::OtherString(e.to_string()))?,
            ))
        } else {
            Ok(None)
        }
    }

    pub fn borrow_decode<'de, Context, D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Option<Mime>, DecodeError> {
        decode(decoder)
    }
}

/// Encode/decode as a serialized string encoded using `serde_json`.
///
/// This encodes less efficiently than `#[bincode(with_serde)]` would, but avoids [bincode's known
/// compatibility issues][serde-issues]. Use this for infrequently-serialized types and when you're
/// unsure if the underlying type may trigger a serde compatibility issue.
///
/// In the future this could be replaced with a more efficient serde-compatible self-describing
/// format with a compact binary representation (e.g. pot or MessagePack), but `serde_json` is
/// convenient because it avoids introducing additional dependencies.
///
/// [serde-issues]: https://docs.rs/bincode/latest/bincode/serde/index.html#known-issues
pub mod serde_json {
    use super::*;

    pub fn encode<E: Encoder, T: serde::Serialize>(
        value: &T,
        encoder: &mut E,
    ) -> Result<(), EncodeError> {
        let json_str =
            ::serde_json::to_string(value).map_err(|e| EncodeError::OtherString(e.to_string()))?;
        Encode::encode(&json_str, encoder)
    }

    pub fn decode<Context, D: Decoder<Context = Context>, T: serde::de::DeserializeOwned>(
        decoder: &mut D,
    ) -> Result<T, DecodeError> {
        let json_str: String = Decode::decode(decoder)?;
        ::serde_json::from_str(&json_str).map_err(|e| DecodeError::OtherString(e.to_string()))
    }

    pub fn borrow_decode<
        'de,
        Context,
        D: BorrowDecoder<'de, Context = Context>,
        T: serde::de::Deserialize<'de>,
    >(
        decoder: &mut D,
    ) -> Result<T, DecodeError> {
        let json_str: &str = BorrowDecode::borrow_decode(decoder)?;
        ::serde_json::from_str(json_str).map_err(|e| DecodeError::OtherString(e.to_string()))
    }
}

pub mod either {
    use ::either::Either;

    use super::*;

    pub fn encode<E: Encoder, L: Encode, R: Encode>(
        value: &Either<L, R>,
        encoder: &mut E,
    ) -> Result<(), EncodeError> {
        value.is_left().encode(encoder)?;
        ::either::for_both!(value, v => Encode::encode(v, encoder))
    }

    pub fn decode<
        Context,
        D: Decoder<Context = Context>,
        L: Decode<Context>,
        R: Decode<Context>,
    >(
        decoder: &mut D,
    ) -> Result<Either<L, R>, DecodeError> {
        let is_left = bool::decode(decoder)?;
        Ok(if is_left {
            Either::Left(L::decode(decoder)?)
        } else {
            Either::Right(R::decode(decoder)?)
        })
    }

    pub fn borrow_decode<
        'de,
        Context,
        D: BorrowDecoder<'de, Context = Context>,
        L: BorrowDecode<'de, Context>,
        R: BorrowDecode<'de, Context>,
    >(
        decoder: &mut D,
    ) -> Result<Either<L, R>, DecodeError> {
        let is_left = bool::borrow_decode(decoder)?;
        Ok(if is_left {
            Either::Left(L::borrow_decode(decoder)?)
        } else {
            Either::Right(R::borrow_decode(decoder)?)
        })
    }
}
